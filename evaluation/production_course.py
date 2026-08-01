#!/usr/bin/env python3
"""Run a small execution-backed coding course against a local chat endpoint.

The harness is deliberately sequential and fail-closed. It never starts a model,
downloads artifacts, invokes Docker, edits the repository, or exposes hidden test
source to the endpoint. A passing result is possible only after the unchanged
hidden tests execute against an allowlisted full-file replacement.
"""

from __future__ import annotations

import argparse
import datetime as dt
import hashlib
import json
import os
import re
import resource
import shutil
import subprocess
import sys
import tempfile
import time
import urllib.error
import urllib.parse
import urllib.request
from dataclasses import asdict, dataclass
from pathlib import Path, PurePosixPath
from typing import Any, Dict, Iterable, List, Mapping, Optional, Sequence, Tuple


EVALUATION_ROOT = Path(__file__).resolve().parent
DEFAULT_COURSE = EVALUATION_ROOT / "course.json"
DEFAULT_RUNS_DIR = EVALUATION_ROOT / "runs"
MAX_RESPONSE_BYTES = 512 * 1024
MAX_FILE_BYTES = 128 * 1024
MAX_OUTPUT_CHARS = 16_000
LOCAL_HOSTS = {"127.0.0.1", "localhost", "::1"}
FILE_BLOCK = re.compile(
    r"^@@FILE[ \t]+(?P<path>[^\r\n]+)\r?\n(?P<content>.*?)^@@END[ \t]*$",
    re.MULTILINE | re.DOTALL,
)
CODE_FENCE = re.compile(
    r"```(?:javascript|js|typescript|ts|cjs)?[ \t]*\r?\n(?P<content>.*?)\r?\n```",
    re.IGNORECASE | re.DOTALL,
)
FORBIDDEN_SOURCE = (
    re.compile(r"\b(?:require|process|globalThis|global|eval|Function)\b"),
    re.compile(r"\bimport\s*\("),
    re.compile(r"constructor\s*\.\s*constructor"),
    re.compile(r"\b__proto__\b"),
    re.compile(r"\b(?:child_process|worker_threads|node:fs|node:net|node:http|node:https|node:dgram)\b"),
)

REPAIR_STRATEGIES = (
    "Build a behavior table from every contract obligation before coding. Check each branch against that table.",
    "Audit API shape. Use only fields and callables explicitly present in source or the contract; remove invented helpers.",
    "Audit ownership and state transitions. Clone every changed container, preserve protected values, and reject malformed state.",
    "Construct boundary counterexamples for every length, type, range, duplicate, terminal-state, and error-message rule.",
    "Re-derive the smallest complete implementation from the contract. Do not preserve a strategy that execution already disproved.",
)


class CourseError(RuntimeError):
    """Raised when course data or a candidate violates a hard invariant."""


@dataclass
class CommandResult:
    command: List[str]
    exit_code: Optional[int]
    duration_seconds: float
    timed_out: bool
    output: str

    @property
    def passed(self) -> bool:
        return self.exit_code == 0 and not self.timed_out


def utc_now() -> str:
    return dt.datetime.now(dt.timezone.utc).isoformat().replace("+00:00", "Z")


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(64 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def sha256_text(value: str) -> str:
    return hashlib.sha256(value.encode("utf-8")).hexdigest()


def bounded_text(value: str, limit: int = MAX_OUTPUT_CHARS) -> str:
    if len(value) <= limit:
        return value
    head = limit // 3
    tail = limit - head
    return value[:head] + "\n...[output truncated]...\n" + value[-tail:]


def contract_obligations(contract: str) -> List[str]:
    """Split a public contract at top-level punctuation, never inside calls."""
    clauses: List[str] = []
    current: List[str] = []
    depth = 0
    for char in contract.strip():
        if char in "([":
            depth += 1
        elif char in ")]" and depth:
            depth -= 1
        if depth == 0 and char in ".;,":
            clause = "".join(current).strip()
            if clause:
                clauses.append(clause)
            current = []
        else:
            current.append(char)
    clause = "".join(current).strip()
    if clause:
        clauses.append(clause)
    return [re.sub(r"^(?:and\s+)", "", item, flags=re.IGNORECASE) for item in clauses]


def compact_execution_evidence(output: str, limit: int = 6000) -> str:
    """Keep failing assertions and summaries; discard paths and stack noise."""
    selected: List[str] = []
    for raw in output.splitlines():
        line = raw.rstrip()
        stripped = line.strip()
        if (
            re.match(r"^(?:not ok|ok)\s+\d+\s+-", stripped)
            or re.match(r"^# (?:tests|pass|fail|cancelled|skipped|todo)\b", stripped)
            or re.match(r"^(?:error|expected|actual|operator|code|name):", stripped)
            or "Expected values to be" in stripped
            or "Missing expected exception" in stripped
            or stripped.startswith(("+ ", "- "))
        ):
            selected.append(stripped)
    compact = "\n".join(selected).strip()
    return bounded_text(compact or output, limit)


def execution_quality(result: CommandResult) -> Tuple[int, int, int]:
    """Rank observed test outcomes without treating prose or latency as correctness."""
    if result.timed_out:
        return (0, 0, -10**9)
    passed = re.search(r"^# pass\s+(\d+)\s*$", result.output, re.MULTILINE)
    failed = re.search(r"^# fail\s+(\d+)\s*$", result.output, re.MULTILINE)
    pass_count = int(passed.group(1)) if passed else len(re.findall(r"^ok\s+\d+\s+-", result.output, re.MULTILINE))
    fail_count = int(failed.group(1)) if failed else len(re.findall(r"^not ok\s+\d+\s+-", result.output, re.MULTILINE))
    return (1 if result.passed else 0, pass_count, -fail_count)


def parse_memory_pressure(output: str) -> Optional[int]:
    match = re.search(r"System-wide memory free percentage:\s*(\d+)%", output)
    if not match:
        return None
    value = int(match.group(1))
    return value if 0 <= value <= 100 else None


def memory_free_percent() -> Tuple[Optional[int], str]:
    """Measure available memory without a third-party dependency."""
    if sys.platform == "darwin":
        try:
            result = subprocess.run(
                ["/usr/bin/memory_pressure", "-Q"],
                capture_output=True,
                text=True,
                timeout=5,
                check=False,
            )
        except (OSError, subprocess.TimeoutExpired) as exc:
            return None, "memory_pressure unavailable: %s" % exc
        value = parse_memory_pressure(result.stdout + result.stderr)
        return value, "memory_pressure -Q" if value is not None else "memory_pressure output was unparseable"

    meminfo = Path("/proc/meminfo")
    if meminfo.exists():
        values: Dict[str, int] = {}
        for line in meminfo.read_text(encoding="utf-8").splitlines():
            key, _, raw = line.partition(":")
            number = raw.strip().split()[0] if raw.strip() else ""
            if number.isdigit():
                values[key] = int(number)
        total = values.get("MemTotal")
        available = values.get("MemAvailable")
        if total and available is not None:
            return round(available * 100 / total), "/proc/meminfo"
    return None, "no supported memory telemetry"


def require_memory(minimum_free: int) -> Dict[str, Any]:
    free, source = memory_free_percent()
    if free is None:
        raise CourseError("Memory admission unavailable (%s); refusing to run" % source)
    if free < minimum_free:
        raise CourseError(
            "Memory admission rejected: %d%% free is below required %d%%" % (free, minimum_free)
        )
    return {"free_percent": free, "minimum_percent": minimum_free, "source": source}


def safe_relative_path(raw: str) -> str:
    if "\\" in raw or "\x00" in raw:
        raise CourseError("Invalid file path: %r" % raw)
    candidate = PurePosixPath(raw.strip())
    if candidate.is_absolute() or not candidate.parts or any(part in ("", ".", "..") for part in candidate.parts):
        raise CourseError("Path must be a normalized relative POSIX path: %r" % raw)
    return candidate.as_posix()


def parse_file_blocks(response: str, allowed_files: Iterable[str]) -> Dict[str, str]:
    allowed = {safe_relative_path(path) for path in allowed_files}
    matches = list(FILE_BLOCK.finditer(response))
    if not matches:
        # Small local models often return a single correct file in a Markdown
        # fence despite explicit protocol instructions. Recovery is allowed
        # only when the destination is unambiguous; execution still decides.
        fences = list(CODE_FENCE.finditer(response))
        if len(allowed) == 1 and len(fences) == 1 and response.count("```") == 2:
            return {next(iter(allowed)): fences[0].group("content") + "\n"}
        raise CourseError("No complete @@FILE ... @@END block or unambiguous single-file fence was returned")
    if response.count("@@FILE") != len(matches) or response.count("@@END") != len(matches):
        raise CourseError("Malformed or nested file protocol")
    patches: Dict[str, str] = {}
    for match in matches:
        path = safe_relative_path(match.group("path"))
        if path not in allowed:
            raise CourseError("Out-of-scope file rejected: %s" % path)
        if path in patches:
            raise CourseError("Duplicate replacement rejected: %s" % path)
        content = match.group("content")
        fences = list(CODE_FENCE.finditer(content))
        if len(fences) == 1 and content.strip() == fences[0].group(0).strip():
            content = fences[0].group("content") + "\n"
        if len(content.encode("utf-8")) > MAX_FILE_BYTES:
            raise CourseError("Replacement exceeds %d bytes: %s" % (MAX_FILE_BYTES, path))
        patches[path] = content
    return patches


def validate_candidate_source(patches: Mapping[str, str]) -> None:
    for path, source in patches.items():
        scrubbed = source.replace("module.exports", "")
        for pattern in FORBIDDEN_SOURCE:
            if pattern.search(scrubbed):
                raise CourseError("Unsafe runtime capability rejected in %s: %s" % (path, pattern.pattern))


def hidden_hashes(workdir: Path, expected: Mapping[str, str]) -> Dict[str, str]:
    observed: Dict[str, str] = {}
    for relative, wanted in expected.items():
        normalized = safe_relative_path(relative)
        path = workdir / normalized
        if not path.is_file():
            raise CourseError("Hidden test missing: %s" % normalized)
        actual = sha256_file(path)
        if actual != wanted:
            raise CourseError("Hidden test integrity failure: %s" % normalized)
        observed[normalized] = actual
    return observed


def apply_patches(workdir: Path, patches: Mapping[str, str], allowed_files: Iterable[str]) -> Dict[str, str]:
    allowed = {safe_relative_path(path) for path in allowed_files}
    hashes: Dict[str, str] = {}
    for relative, content in patches.items():
        normalized = safe_relative_path(relative)
        if normalized not in allowed:
            raise CourseError("Out-of-scope write rejected: %s" % normalized)
        target = workdir / normalized
        target.parent.mkdir(parents=True, exist_ok=True)
        with tempfile.NamedTemporaryFile("w", encoding="utf-8", dir=str(target.parent), delete=False) as handle:
            handle.write(content)
            temporary = Path(handle.name)
        temporary.replace(target)
        hashes[normalized] = sha256_file(target)
    return hashes


def validate_test_command(command: Sequence[str], hidden_tests: Mapping[str, str]) -> List[str]:
    actual = list(command)
    if len(actual) < 3 or actual[:2] != ["node", "--test"]:
        raise CourseError("Only a fixed node --test command is permitted")
    hidden = {safe_relative_path(path) for path in hidden_tests}
    for argument in actual[2:]:
        if safe_relative_path(argument) not in hidden:
            raise CourseError("Test command references an unprotected file: %s" % argument)
    return actual


def _child_limits() -> None:
    resource.setrlimit(resource.RLIMIT_CPU, (20, 20))
    resource.setrlimit(resource.RLIMIT_FSIZE, (16 * 1024 * 1024, 16 * 1024 * 1024))
    resource.setrlimit(resource.RLIMIT_NOFILE, (128, 128))


def run_test_command(workdir: Path, command: Sequence[str], timeout_seconds: int) -> CommandResult:
    started = time.monotonic()
    env = {
        "PATH": os.environ.get("PATH", "/usr/bin:/bin"),
        "HOME": str(workdir / ".home"),
        "CI": "1",
        "NO_COLOR": "1",
        "NODE_OPTIONS": "--no-warnings",
    }
    try:
        result = subprocess.run(
            list(command),
            cwd=str(workdir),
            capture_output=True,
            text=True,
            timeout=timeout_seconds,
            check=False,
            env=env,
            preexec_fn=_child_limits if os.name == "posix" else None,
        )
        return CommandResult(
            command=list(command),
            exit_code=result.returncode,
            duration_seconds=round(time.monotonic() - started, 4),
            timed_out=False,
            output=bounded_text(result.stdout + result.stderr),
        )
    except subprocess.TimeoutExpired as exc:
        stdout = exc.stdout.decode() if isinstance(exc.stdout, bytes) else (exc.stdout or "")
        stderr = exc.stderr.decode() if isinstance(exc.stderr, bytes) else (exc.stderr or "")
        return CommandResult(
            command=list(command),
            exit_code=None,
            duration_seconds=round(time.monotonic() - started, 4),
            timed_out=True,
            output=bounded_text(stdout + stderr + "\nTimed out"),
        )


def normalize_endpoint(endpoint: str) -> str:
    parsed = urllib.parse.urlparse(endpoint)
    if parsed.scheme != "http" or parsed.hostname not in LOCAL_HOSTS:
        raise CourseError("Endpoint must be local HTTP on localhost, 127.0.0.1, or ::1")
    if parsed.username or parsed.password or parsed.query or parsed.fragment:
        raise CourseError("Endpoint credentials, query parameters, and fragments are not permitted")
    path = parsed.path.rstrip("/")
    if path.endswith("/v1/chat/completions"):
        return urllib.parse.urlunparse(parsed._replace(path=path))
    if path.endswith("/v1"):
        path += "/chat/completions"
    else:
        path += "/v1/chat/completions"
    return urllib.parse.urlunparse(parsed._replace(path=path))


def call_local_endpoint(
    endpoint: str,
    model: str,
    messages: Sequence[Mapping[str, str]],
    timeout_seconds: int,
    max_tokens: int,
) -> str:
    payload = json.dumps(
        {
            "model": model,
            "messages": list(messages),
            "temperature": 0.1,
            "max_tokens": max_tokens,
            "stream": False,
        }
    ).encode("utf-8")
    request = urllib.request.Request(
        normalize_endpoint(endpoint),
        data=payload,
        headers={"Content-Type": "application/json", "Accept": "application/json"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(request, timeout=timeout_seconds) as response:
            body = response.read(MAX_RESPONSE_BYTES + 1)
    except (urllib.error.URLError, urllib.error.HTTPError, TimeoutError, OSError) as exc:
        raise CourseError("Local endpoint unavailable: %s" % exc) from exc
    if len(body) > MAX_RESPONSE_BYTES:
        raise CourseError("Endpoint response exceeded %d bytes" % MAX_RESPONSE_BYTES)
    try:
        data = json.loads(body.decode("utf-8"))
        content = data["choices"][0]["message"]["content"]
    except (UnicodeDecodeError, json.JSONDecodeError, KeyError, IndexError, TypeError) as exc:
        raise CourseError("Endpoint returned an invalid chat completion") from exc
    if not isinstance(content, str) or not content.strip():
        raise CourseError("Endpoint returned empty assistant content")
    return content


def read_allowed_sources(workdir: Path, allowed_files: Iterable[str]) -> str:
    sections = []
    for relative in allowed_files:
        normalized = safe_relative_path(relative)
        path = workdir / normalized
        if not path.is_file():
            raise CourseError("Allowed source is missing: %s" % normalized)
        sections.append("### %s\n```javascript\n%s\n```" % (normalized, path.read_text(encoding="utf-8")))
    return "\n\n".join(sections)


def candidate_messages(
    task: Mapping[str, Any],
    workdir: Path,
    evidence: str,
    evidence_label: str,
    strategy: str = REPAIR_STRATEGIES[0],
) -> List[Dict[str, str]]:
    system = (
        "You are Veylaro, operating inside a strict execution evaluator. Repair only the allowlisted source files. "
        "Return complete files using exactly @@FILE relative/path, file contents, @@END. Never edit or request tests. "
        "Preserve the stated API, make the smallest correct repair, and do not claim that tests passed. "
        "Use only properties and functions shown in source or named by the contract; never invent an API."
    )
    obligations = "\n".join(
        "%d. %s" % (index, clause)
        for index, clause in enumerate(contract_obligations(task["contract"]), start=1)
    )
    user = (
        "TASK\n%s\n\nCONTRACT OBLIGATIONS — ALL ARE REQUIRED\n%s\n\nALLOWLIST\n%s\n\n"
        "REPRODUCTION COMMAND\n%s\n\n%s\n%s\n\nOBSERVED SOURCE\n%s\n\n"
        "SEARCH LANE\n%s\n\nBefore returning, silently check every numbered obligation against the code."
        % (
            task["title"],
            obligations,
            "\n".join(task["allowed_files"]),
            " ".join(task["test_command"]),
            evidence_label,
            compact_execution_evidence(evidence),
            read_allowed_sources(workdir, task["allowed_files"]),
            strategy,
        )
    )
    return [{"role": "system", "content": system}, {"role": "user", "content": user}]


def initial_messages(task: Mapping[str, Any], workdir: Path, baseline: CommandResult) -> List[Dict[str, str]]:
    return candidate_messages(task, workdir, baseline.output, "OBSERVED BASELINE FAILURE")


def load_course(path: Path) -> Dict[str, Any]:
    data = json.loads(path.read_text(encoding="utf-8"))
    if data.get("schema_version") != 1 or not isinstance(data.get("fixtures"), list):
        raise CourseError("Unsupported or malformed course manifest")
    seen = set()
    for task in data["fixtures"]:
        required = {"id", "title", "fixture_dir", "contract", "allowed_files", "hidden_tests", "test_command"}
        if not required.issubset(task):
            raise CourseError("Fixture is missing required fields")
        if task["id"] in seen:
            raise CourseError("Duplicate fixture id: %s" % task["id"])
        seen.add(task["id"])
        task["allowed_files"] = [safe_relative_path(path) for path in task["allowed_files"]]
        task["hidden_tests"] = {safe_relative_path(path): digest for path, digest in task["hidden_tests"].items()}
        if any(not re.fullmatch(r"[0-9a-f]{64}", digest) for digest in task["hidden_tests"].values()):
            raise CourseError("Fixture contains an invalid hidden-test SHA-256 digest")
        task["test_command"] = validate_test_command(task["test_command"], task["hidden_tests"])
    return data


def fixture_source(course_path: Path, task: Mapping[str, Any]) -> Path:
    root = course_path.resolve().parent
    candidate = (root / safe_relative_path(task["fixture_dir"])).resolve()
    if os.path.commonpath([str(root), str(candidate)]) != str(root) or not candidate.is_dir():
        raise CourseError("Fixture directory is invalid: %s" % task["fixture_dir"])
    return candidate


def attempt_record(
    phase: str,
    response: str,
    patches: Mapping[str, str],
    result: CommandResult,
    retained: bool,
) -> Dict[str, Any]:
    return {
        "phase": phase,
        "response_sha256": sha256_text(response),
        "files": sorted(patches),
        "source_sha256": {path: sha256_text(content) for path, content in patches.items()},
        "execution": asdict(result),
        "execution_quality": list(execution_quality(result)),
        "retained_as_best": retained,
        "passed": result.passed,
    }


def execute_task(
    course_path: Path,
    task: Mapping[str, Any],
    endpoint: str,
    model: str,
    minimum_memory: int,
    endpoint_timeout: int,
    execution_timeout: int,
    max_tokens: int,
    repair_turns: int = 2,
) -> Dict[str, Any]:
    started = utc_now()
    result: Dict[str, Any] = {
        "id": task["id"], "title": task["title"], "status": "unavailable", "passed": None,
        "started_at": started, "finished_at": None, "attempts": [],
    }
    try:
        admission = require_memory(minimum_memory)
        result["memory_admission"] = admission
        with tempfile.TemporaryDirectory(prefix="veylaro-course-%s-" % task["id"]) as temporary:
            workdir = Path(temporary)
            shutil.copytree(fixture_source(course_path, task), workdir, dirs_exist_ok=True)
            protected = hidden_hashes(workdir, task["hidden_tests"])
            result["hidden_test_sha256"] = protected
            baseline = run_test_command(workdir, task["test_command"], execution_timeout)
            result["baseline"] = asdict(baseline)
            hidden_hashes(workdir, task["hidden_tests"])
            if baseline.timed_out:
                raise CourseError("Baseline reproduction timed out")
            if baseline.passed:
                raise CourseError("Baseline reproduction unexpectedly passed; fixture is invalid")

            messages = initial_messages(task, workdir, baseline)
            previous_signature = ""
            best_sources = {
                relative: (workdir / safe_relative_path(relative)).read_text(encoding="utf-8")
                for relative in task["allowed_files"]
            }
            best_quality = execution_quality(baseline)
            result["baseline_quality"] = list(best_quality)
            for attempt_index in range(repair_turns + 1):
                phase = "initial" if attempt_index == 0 else ("repair" if attempt_index == 1 else "repair-%d" % attempt_index)
                require_memory(minimum_memory)
                response = call_local_endpoint(endpoint, model, messages, endpoint_timeout, max_tokens)
                try:
                    patches = parse_file_blocks(response, task["allowed_files"])
                    validate_candidate_source(patches)
                    apply_patches(workdir, patches, task["allowed_files"])
                    hidden_hashes(workdir, task["hidden_tests"])
                    execution = run_test_command(workdir, task["test_command"], execution_timeout)
                    hidden_hashes(workdir, task["hidden_tests"])
                    candidate_quality = execution_quality(execution)
                    retained = candidate_quality > best_quality
                    result["attempts"].append(attempt_record(phase, response, patches, execution, retained))
                    if execution.passed:
                        result["status"] = "measured"
                        result["passed"] = True
                        return result
                    if retained:
                        best_quality = candidate_quality
                        best_sources = {
                            relative: (workdir / safe_relative_path(relative)).read_text(encoding="utf-8")
                            for relative in task["allowed_files"]
                        }
                    else:
                        apply_patches(workdir, best_sources, task["allowed_files"])
                    evidence = execution.output
                except CourseError as exc:
                    evidence = "PROTOCOL OR SCOPE REJECTION: %s" % exc
                    result["attempts"].append({
                        "phase": phase,
                        "response_sha256": sha256_text(response),
                        "files": [],
                        "source_sha256": {},
                        "execution": None,
                        "execution_quality": None,
                        "retained_as_best": False,
                        "passed": False,
                        "rejection": str(exc),
                    })

                if attempt_index < repair_turns:
                    signature = sha256_text(compact_execution_evidence(evidence))
                    label = "ACTUAL FAILURE FROM THE PREVIOUS CANDIDATE"
                    if signature == previous_signature:
                        label += "\nSTAGNATION DETECTED: discard the previous strategy and re-derive the implementation from the contract"
                    previous_signature = signature
                    label += "\nMONOTONIC SEARCH: the observed source below is the best executed candidate so far; regressions were rolled back"
                    # Reset the context after every execution. Replaying failed
                    # prose anchors small models to the same broken strategy.
                    strategy = REPAIR_STRATEGIES[min(attempt_index + 1, len(REPAIR_STRATEGIES) - 1)]
                    messages = candidate_messages(task, workdir, evidence, label, strategy)

            result["status"] = "measured"
            result["passed"] = False
            result["best_execution_quality"] = list(best_quality)
            result["failure"] = "Candidate failed after %d bounded repair turns" % repair_turns
            return result
    except CourseError as exc:
        result["failure"] = str(exc)
        return result
    finally:
        result["finished_at"] = utc_now()


def validate_fixture(course_path: Path, task: Mapping[str, Any], execution_timeout: int) -> Dict[str, Any]:
    with tempfile.TemporaryDirectory(prefix="veylaro-dry-%s-" % task["id"]) as temporary:
        workdir = Path(temporary)
        shutil.copytree(fixture_source(course_path, task), workdir, dirs_exist_ok=True)
        hashes = hidden_hashes(workdir, task["hidden_tests"])
        baseline = run_test_command(workdir, task["test_command"], execution_timeout)
        hidden_hashes(workdir, task["hidden_tests"])
        if baseline.timed_out or baseline.passed:
            raise CourseError("Fixture %s did not reproduce a bounded failure" % task["id"])
        return {
            "id": task["id"],
            "status": "validated",
            "baseline_exit_code": baseline.exit_code,
            "baseline_duration_seconds": baseline.duration_seconds,
            "hidden_test_sha256": hashes,
        }


def build_report(
    course_path: Path,
    course: Mapping[str, Any],
    endpoint: Optional[str],
    model: Optional[str],
    dry_run: bool,
    minimum_memory: int,
    endpoint_timeout: int,
    execution_timeout: int,
    max_tokens: int,
    repair_turns: int = 2,
) -> Dict[str, Any]:
    report: Dict[str, Any] = {
        "schema_version": 1,
        "course": course["course"],
        "mode": "dry-run" if dry_run else "evaluation",
        "model": model,
        "endpoint": normalize_endpoint(endpoint) if endpoint else None,
        "repair_turns": repair_turns,
        "started_at": utc_now(),
        "finished_at": None,
        "result_status": "unavailable",
        "tasks": [],
        "aggregate": {"measured_tasks": 0, "passed_tasks": 0, "total_tasks": len(course["fixtures"]), "score_percent": None},
    }
    if dry_run:
        report["tasks"] = [validate_fixture(course_path, task, execution_timeout) for task in course["fixtures"]]
        report["result_status"] = "validated"
        report["finished_at"] = utc_now()
        return report

    if not endpoint or not model:
        raise CourseError("--endpoint and --model are required outside --dry-run")
    try:
        report["initial_memory_admission"] = require_memory(minimum_memory)
    except CourseError as exc:
        report["unavailable_reason"] = str(exc)
        report["finished_at"] = utc_now()
        return report

    for task in course["fixtures"]:
        report["tasks"].append(
            execute_task(
                course_path, task, endpoint, model, minimum_memory,
                endpoint_timeout, execution_timeout, max_tokens, repair_turns,
            )
        )

    measured = [task for task in report["tasks"] if task["status"] == "measured"]
    passed = [task for task in measured if task["passed"]]
    report["aggregate"].update({"measured_tasks": len(measured), "passed_tasks": len(passed)})
    if len(measured) == len(course["fixtures"]):
        report["result_status"] = "measured"
        report["aggregate"]["score_percent"] = round(100 * len(passed) / len(measured), 2)
    else:
        report["result_status"] = "unavailable"
        report["unavailable_reason"] = "One or more tasks lacked executable endpoint evidence; no aggregate score was issued"
    report["finished_at"] = utc_now()
    return report


def output_path(value: Optional[str], model: Optional[str], dry_run: bool) -> Path:
    if value:
        return Path(value).expanduser().resolve()
    stamp = dt.datetime.now().strftime("%Y%m%d-%H%M%S")
    label = "dry-run" if dry_run else re.sub(r"[^A-Za-z0-9_.-]+", "-", model or "unknown")
    return DEFAULT_RUNS_DIR / ("%s-%s.json" % (label, stamp))


def parse_args(argv: Optional[Sequence[str]] = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--course", default=str(DEFAULT_COURSE))
    parser.add_argument("--endpoint", help="Local OpenAI-compatible base URL or chat completions URL")
    parser.add_argument("--model", help="Model identifier sent to the already-running local endpoint")
    parser.add_argument("--output", help="JSON report path (defaults to evaluation/runs)")
    parser.add_argument("--dry-run", action="store_true", help="Validate fixtures and baseline failures without contacting a model")
    parser.add_argument("--min-memory-free", type=int, default=30)
    parser.add_argument("--endpoint-timeout", type=int, default=120)
    parser.add_argument("--execution-timeout", type=int, default=30)
    parser.add_argument("--max-tokens", type=int, default=4096)
    parser.add_argument("--repair-turns", type=int, default=2, help="Bounded evidence-driven repair turns after the first candidate (0-4)")
    args = parser.parse_args(argv)
    if not 1 <= args.min_memory_free <= 100:
        parser.error("--min-memory-free must be between 1 and 100")
    if args.endpoint_timeout < 1 or args.execution_timeout < 1 or args.max_tokens < 128:
        parser.error("timeouts must be positive and --max-tokens must be at least 128")
    if not 0 <= args.repair_turns <= 4:
        parser.error("--repair-turns must be between 0 and 4")
    return args


def main(argv: Optional[Sequence[str]] = None) -> int:
    args = parse_args(argv)
    destination = output_path(args.output, args.model, args.dry_run)
    try:
        course_path = Path(args.course).expanduser().resolve()
        course = load_course(course_path)
        report = build_report(
            course_path, course, args.endpoint, args.model, args.dry_run,
            args.min_memory_free, args.endpoint_timeout, args.execution_timeout, args.max_tokens,
            args.repair_turns,
        )
    except (CourseError, OSError, json.JSONDecodeError) as exc:
        print("course error: %s" % exc, file=sys.stderr)
        return 2
    destination.parent.mkdir(parents=True, exist_ok=True)
    destination.write_text(json.dumps(report, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    print(json.dumps({"report": str(destination), "status": report["result_status"], "aggregate": report["aggregate"]}, indent=2))
    return 0 if report["result_status"] in ("validated", "measured") else 1


if __name__ == "__main__":
    raise SystemExit(main())
