import shutil
import tempfile
import unittest
from pathlib import Path
from unittest import mock

from evaluation.production_course import (
    CourseError,
    apply_patches,
    build_report,
    compact_execution_evidence,
    contract_obligations,
    execute_task,
    execution_quality,
    hidden_hashes,
    load_course,
    parse_file_blocks,
    parse_memory_pressure,
    run_test_command,
    normalize_endpoint,
    validate_candidate_source,
    validate_fixture,
    CommandResult,
)


ROOT = Path(__file__).resolve().parents[1]
COURSE_PATH = ROOT / "course.json"
REFERENCE = ROOT / "tests" / "reference"


class ProtocolTests(unittest.TestCase):
    def test_parses_allowlisted_complete_file(self):
        result = parse_file_blocks("note\n@@FILE src/app.cjs\nmodule.exports = 1;\n@@END\n", ["src/app.cjs"])
        self.assertEqual(result, {"src/app.cjs": "module.exports = 1;\n"})

    def test_recovers_only_an_unambiguous_single_file_fence(self):
        fenced = "Here is the repair.\n```javascript\nmodule.exports = 1;\n```"
        self.assertEqual(parse_file_blocks(fenced, ["src/app.cjs"]), {"src/app.cjs": "module.exports = 1;\n"})
        wrapped = "@@FILE src/app.cjs\n```js\nmodule.exports = 2;\n```\n@@END"
        self.assertEqual(parse_file_blocks(wrapped, ["src/app.cjs"]), {"src/app.cjs": "module.exports = 2;\n"})
        with self.assertRaises(CourseError):
            parse_file_blocks(fenced, ["src/app.cjs", "src/other.cjs"])
        with self.assertRaises(CourseError):
            parse_file_blocks("```js\none\n```\n```js\ntwo\n```", ["src/app.cjs"])

    def test_rejects_traversal_and_out_of_scope_paths(self):
        with self.assertRaises(CourseError):
            parse_file_blocks("@@FILE ../hidden/test.cjs\nx\n@@END", ["src/app.cjs"])
        with self.assertRaises(CourseError):
            parse_file_blocks("@@FILE hidden/test.cjs\nx\n@@END", ["src/app.cjs"])

    def test_rejects_partial_or_duplicate_protocol(self):
        with self.assertRaises(CourseError):
            parse_file_blocks("@@FILE src/app.cjs\nx", ["src/app.cjs"])
        with self.assertRaises(CourseError):
            parse_file_blocks("@@FILE src/app.cjs\nx\n@@END\n@@FILE src/app.cjs\ny\n@@END", ["src/app.cjs"])

    def test_rejects_runtime_escape_capabilities(self):
        for source in ["require('node:fs')", "process.exit()", "({}).constructor.constructor('return process')()"]:
            with self.assertRaises(CourseError):
                validate_candidate_source({"src/app.cjs": source})

    def test_parses_macos_memory_pressure(self):
        self.assertEqual(parse_memory_pressure("System-wide memory free percentage: 52%"), 52)
        self.assertIsNone(parse_memory_pressure("unknown"))

    def test_endpoint_is_restricted_to_local_http(self):
        self.assertEqual(normalize_endpoint("http://127.0.0.1:8080/v1"), "http://127.0.0.1:8080/v1/chat/completions")
        with self.assertRaises(CourseError):
            normalize_endpoint("https://api.example.com/v1")
        with self.assertRaises(CourseError):
            normalize_endpoint("http://user:secret@127.0.0.1:8080/v1")

    def test_contract_compiler_preserves_commas_inside_function_signatures(self):
        clauses = contract_obligations("Repair createProject(context, input, projects). It must authenticate, normalize input, and stay immutable.")
        self.assertEqual(clauses[0], "Repair createProject(context, input, projects)")
        self.assertIn("It must authenticate", clauses)
        self.assertIn("normalize input", clauses)

    def test_failure_compactor_keeps_assertions_and_drops_stack_paths(self):
        raw = "not ok 1 - rejects malformed state\n  error: Missing expected exception.\n  stack: /secret/path:1\n# tests 1\n# pass 0\n# fail 1\n"
        compact = compact_execution_evidence(raw)
        self.assertIn("not ok 1", compact)
        self.assertIn("error:", compact)
        self.assertNotIn("/secret/path", compact)

    def test_execution_quality_is_monotonic_on_real_test_counts(self):
        one_pass = CommandResult(["node", "--test"], 1, 0.1, False, "# pass 1\n# fail 2\n")
        two_pass = CommandResult(["node", "--test"], 1, 0.1, False, "# pass 2\n# fail 1\n")
        all_pass = CommandResult(["node", "--test"], 0, 0.1, False, "# pass 3\n# fail 0\n")
        timeout = CommandResult(["node", "--test"], None, 10, True, "Timed out")
        self.assertLess(execution_quality(one_pass), execution_quality(two_pass))
        self.assertLess(execution_quality(two_pass), execution_quality(all_pass))
        self.assertLess(execution_quality(timeout), execution_quality(one_pass))


class FixtureTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.course = load_course(COURSE_PATH)

    def test_every_baseline_reproduces_a_failure(self):
        for task in self.course["fixtures"]:
            with self.subTest(task=task["id"]):
                report = validate_fixture(COURSE_PATH, task, 10)
                self.assertEqual(report["status"], "validated")
                self.assertNotEqual(report["baseline_exit_code"], 0)

    def test_reference_solutions_pass_unchanged_hidden_tests(self):
        references = {
            "debug-repair": REFERENCE / "cart.cjs",
            "saas-authorization": REFERENCE / "projects.cjs",
            "game-state": REFERENCE / "game.cjs",
        }
        for task in self.course["fixtures"]:
            with self.subTest(task=task["id"]), tempfile.TemporaryDirectory() as temporary:
                workdir = Path(temporary)
                fixture = COURSE_PATH.parent / task["fixture_dir"]
                shutil.copytree(fixture, workdir, dirs_exist_ok=True)
                before = hidden_hashes(workdir, task["hidden_tests"])
                content = references[task["id"]].read_text(encoding="utf-8")
                apply_patches(workdir, {task["allowed_files"][0]: content}, task["allowed_files"])
                self.assertEqual(hidden_hashes(workdir, task["hidden_tests"]), before)
                result = run_test_command(workdir, task["test_command"], 10)
                self.assertTrue(result.passed, result.output)
                self.assertEqual(hidden_hashes(workdir, task["hidden_tests"]), before)

    def test_hidden_hash_change_is_detected(self):
        task = self.course["fixtures"][0]
        with tempfile.TemporaryDirectory() as temporary:
            workdir = Path(temporary)
            shutil.copytree(COURSE_PATH.parent / task["fixture_dir"], workdir, dirs_exist_ok=True)
            hidden_hashes(workdir, task["hidden_tests"])
            target = workdir / next(iter(task["hidden_tests"]))
            target.write_text(target.read_text(encoding="utf-8") + "\n", encoding="utf-8")
            with self.assertRaises(CourseError):
                hidden_hashes(workdir, task["hidden_tests"])

    def test_manifest_has_exactly_three_distinct_capabilities(self):
        ids = [task["id"] for task in self.course["fixtures"]]
        self.assertEqual(ids, ["debug-repair", "saas-authorization", "game-state"])

    def test_incomplete_evidence_never_fabricates_an_aggregate_score(self):
        outcomes = [
            {"id": "debug-repair", "status": "measured", "passed": True},
            {"id": "saas-authorization", "status": "unavailable", "passed": None},
            {"id": "game-state", "status": "measured", "passed": False},
        ]
        with mock.patch("evaluation.production_course.require_memory", return_value={"free_percent": 90}), \
             mock.patch("evaluation.production_course.execute_task", side_effect=outcomes):
            report = build_report(
                COURSE_PATH, self.course, "http://127.0.0.1:9999/v1", "fake", False,
                30, 5, 10, 2048,
            )
        self.assertEqual(report["result_status"], "unavailable")
        self.assertIsNone(report["aggregate"]["score_percent"])
        self.assertEqual(report["aggregate"]["measured_tasks"], 2)

    def test_one_repair_turn_uses_real_failure_and_can_pass(self):
        task = self.course["fixtures"][0]
        broken = (COURSE_PATH.parent / task["fixture_dir"] / task["allowed_files"][0]).read_text(encoding="utf-8")
        fixed = (REFERENCE / "cart.cjs").read_text(encoding="utf-8")
        requests = []

        def fake_endpoint(_endpoint, _model, messages, _timeout, _max_tokens):
            requests.append(messages)
            source = broken if len(requests) == 1 else fixed
            return "@@FILE src/cart.cjs\n%s@@END" % source

        with mock.patch("evaluation.production_course.require_memory", return_value={"free_percent": 90, "minimum_percent": 30, "source": "test"}), \
             mock.patch("evaluation.production_course.call_local_endpoint", side_effect=fake_endpoint):
            result = execute_task(
                COURSE_PATH, task, "http://127.0.0.1:9999/v1",
                "fake-local-model", 30, 5, 10, 2048,
            )

        self.assertEqual(result["status"], "measured")
        self.assertTrue(result["passed"])
        self.assertEqual([attempt["phase"] for attempt in result["attempts"]], ["initial", "repair"])
        self.assertEqual(len(requests), 2)
        self.assertIn("ACTUAL FAILURE", requests[1][-1]["content"])

    def test_protocol_rejection_receives_a_bounded_repair_turn(self):
        task = self.course[0] if isinstance(self.course, list) else self.course["fixtures"][0]
        fixed = (REFERENCE / "cart.cjs").read_text(encoding="utf-8")
        replies = iter(["I changed it.", "```javascript\n%s```" % fixed])

        with mock.patch("evaluation.production_course.require_memory", return_value={"free_percent": 90, "minimum_percent": 30, "source": "test"}), \
             mock.patch("evaluation.production_course.call_local_endpoint", side_effect=lambda *_args: next(replies)):
            result = execute_task(
                COURSE_PATH, task, "http://127.0.0.1:9999/v1",
                "fake-local-model", 30, 5, 10, 2048, 1,
            )

        self.assertTrue(result["passed"])
        self.assertEqual(result["attempts"][0]["rejection"], "No complete @@FILE ... @@END block or unambiguous single-file fence was returned")
        self.assertEqual(result["attempts"][1]["phase"], "repair")


if __name__ == "__main__":
    unittest.main()
