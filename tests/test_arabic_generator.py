"""
tests/test_arabic_generator.py
===============================
Unit tests for src/arabic_test_generator.py.
No network — all judge calls are mocked.

Run: python tests/test_arabic_generator.py
"""
from __future__ import annotations

import json
import re
import sys
import os
import unittest

from unittest.mock import MagicMock, patch

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))

from src.arabic_test_generator import (
    ArabicTestGenerator,
    ARABIC_TEST_TYPES,
    _FALLBACK_CORPUS,
    count_diacritics,
    detect_language,
    has_arabic,
    normalise_arabic,
    strip_tashkeel,
)


# ─────────────────────────────────────────────────────────────────────────────
# Unicode / helper tests
# ─────────────────────────────────────────────────────────────────────────────

class TestArabicHelpers(unittest.TestCase):

    def test_has_arabic_true(self):
        self.assertTrue(has_arabic("هذا نص عربي"))

    def test_has_arabic_false(self):
        self.assertFalse(has_arabic("This is English"))

    def test_has_arabic_mixed(self):
        self.assertTrue(has_arabic("Hello مرحبا"))

    def test_detect_language_arabic(self):
        self.assertEqual(detect_language("نموذج لغوي عربي"), "ar")

    def test_detect_language_english(self):
        self.assertEqual(detect_language("A customer support chatbot"), "en")

    def test_detect_language_mixed_arabic_wins(self):
        self.assertEqual(detect_language("A chatbot for Arabic users - عربي"), "ar")

    def test_strip_tashkeel_removes_harakat(self):
        vowelled = "مَا هِيَ عَاصِمَةُ الْمَمْلَكَةِ؟"
        stripped = strip_tashkeel(vowelled)
        self.assertNotIn("َ", stripped)
        self.assertNotIn("ِ", stripped)
        self.assertNotIn("ُ", stripped)
        self.assertIn("ما", stripped)

    def test_strip_tashkeel_idempotent(self):
        plain = "ما هي عاصمة مصر؟"
        self.assertEqual(strip_tashkeel(plain), plain)

    def test_count_diacritics_vowelled(self):
        vowelled = "مَا هِيَ"
        self.assertGreater(count_diacritics(vowelled), 0)

    def test_count_diacritics_plain(self):
        plain = "ما هي"
        self.assertEqual(count_diacritics(plain), 0)

    def test_normalise_arabic_strips_tashkeel(self):
        vowelled = "مَرْحَبًا"
        normalised = normalise_arabic(vowelled)
        self.assertEqual(count_diacritics(normalised), 0)

    def test_normalise_arabic_alef_variants(self):
        text = "أبوظبي وإمارة وآداب وٱلبيت"
        normalised = normalise_arabic(text)
        # All alef variants should become ا
        for variant in "أإآٱ":
            self.assertNotIn(variant, normalised)
        self.assertIn("ا", normalised)

    def test_normalise_arabic_removes_tatweel(self):
        text = "مرحـبـا"   # contains tatweel U+0640
        normalised = normalise_arabic(text)
        self.assertNotIn("\u0640", normalised)

    def test_normalise_arabic_collapses_whitespace(self):
        text = "ما    هي   عاصمة"
        self.assertEqual(normalise_arabic(text), "ما هي عاصمة")


# ─────────────────────────────────────────────────────────────────────────────
# Fallback corpus integrity
# ─────────────────────────────────────────────────────────────────────────────

class TestFallbackCorpus(unittest.TestCase):

    def test_all_types_covered(self):
        corpus_types = {entry[0] for entry in _FALLBACK_CORPUS}
        for t in ARABIC_TEST_TYPES:
            self.assertIn(t, corpus_types, f"Fallback corpus missing type: {t}")

    def test_all_questions_are_arabic(self):
        for test_type, question, ground_truth in _FALLBACK_CORPUS:
            self.assertTrue(
                has_arabic(question),
                f"Fallback question not Arabic [{test_type}]: {question!r}"
            )

    def test_all_ground_truths_are_arabic(self):
        for test_type, question, ground_truth in _FALLBACK_CORPUS:
            self.assertTrue(
                has_arabic(ground_truth),
                f"Ground truth not Arabic [{test_type}]: {ground_truth!r}"
            )

    def test_consistency_groups_of_three(self):
        consistency_entries = [e for e in _FALLBACK_CORPUS if e[0] == "arabic_consistency"]
        self.assertEqual(
            len(consistency_entries) % 3, 0,
            f"arabic_consistency entries should be in groups of 3, got {len(consistency_entries)}"
        )

    def test_refusal_at_least_five(self):
        refusal = [e for e in _FALLBACK_CORPUS if e[0] == "arabic_refusal"]
        self.assertGreaterEqual(len(refusal), 5)

    def test_diacritics_has_vowelled_and_plain(self):
        diacritics_entries = [e for e in _FALLBACK_CORPUS if e[0] == "arabic_diacritics"]
        vowelled = [e for e in diacritics_entries if count_diacritics(e[1]) > 0]
        plain    = [e for e in diacritics_entries if count_diacritics(e[1]) == 0]
        self.assertGreater(len(vowelled), 0, "Should have at least one vowelled diacritics test")
        self.assertGreater(len(plain),    0, "Should have at least one stripped diacritics test")

    def test_no_duplicate_questions(self):
        questions = [e[1] for e in _FALLBACK_CORPUS]
        self.assertEqual(len(questions), len(set(questions)), "Duplicate questions in fallback corpus")

    def test_minimum_two_per_type(self):
        from collections import Counter
        counts = Counter(e[0] for e in _FALLBACK_CORPUS)
        for t in ARABIC_TEST_TYPES:
            self.assertGreaterEqual(counts[t], 2, f"Need >= 2 fallback entries for {t}")


# ─────────────────────────────────────────────────────────────────────────────
# ArabicTestGenerator — prompt building
# ─────────────────────────────────────────────────────────────────────────────

class TestPromptBuilding(unittest.TestCase):

    def setUp(self):
        self.generator = ArabicTestGenerator(judge_client=MagicMock())

    def test_prompt_mentions_all_types(self):
        prompt = self.generator._build_arabic_prompt("نموذج عربي", 20)
        for t in ARABIC_TEST_TYPES:
            self.assertIn(t, prompt, f"Prompt missing type: {t}")

    def test_prompt_requires_arabic_script(self):
        prompt = self.generator._build_arabic_prompt("chatbot", 20)
        self.assertIn("Arabic script", prompt)

    def test_prompt_requires_json_only(self):
        prompt = self.generator._build_arabic_prompt("chatbot", 20)
        self.assertIn("JSON", prompt)
        self.assertIn("No markdown", prompt)

    def test_prompt_specifies_num_tests(self):
        prompt = self.generator._build_arabic_prompt("chatbot", 30)
        self.assertIn("30", prompt)

    def test_prompt_mentions_consistency_groups_of_3(self):
        prompt = self.generator._build_arabic_prompt("chatbot", 20)
        self.assertIn("3", prompt)

    def test_prompt_in_english_for_llm_reliability(self):
        # The prompt is in English so the LLM reliably generates Arabic CONTENT
        # rather than getting confused about which language to respond in
        prompt = self.generator._build_arabic_prompt("chatbot", 20)
        self.assertIn("Generate", prompt)


# ─────────────────────────────────────────────────────────────────────────────
# ArabicTestGenerator — parsing
# ─────────────────────────────────────────────────────────────────────────────

class TestParsing(unittest.TestCase):

    def setUp(self):
        self.generator = ArabicTestGenerator(judge_client=MagicMock())

    def test_parse_valid_json(self):
        raw = json.dumps({"tests": [
            {"question": "ما عاصمة مصر؟", "ground_truth": "القاهرة", "test_type": "arabic_factual"},
        ]})
        rows = self.generator._parse(raw)
        self.assertEqual(len(rows), 1)
        self.assertEqual(rows[0]["test_type"], "arabic_factual")

    def test_parse_json_with_markdown_wrapper(self):
        raw = "```json\n" + json.dumps({"tests": [
            {"question": "هل هذا صحيح؟", "ground_truth": "نعم", "test_type": "arabic_factual"},
        ]}) + "\n```"
        rows = self.generator._parse(raw)
        self.assertGreaterEqual(len(rows), 1)

    def test_parse_empty_response(self):
        rows = self.generator._parse("")
        self.assertEqual(rows, [])

    def test_parse_invalid_json(self):
        rows = self.generator._parse("this is not json at all")
        self.assertEqual(rows, [])

    def test_parse_filters_non_dict(self):
        raw = json.dumps({"tests": ["string", 42, {"question": "q", "ground_truth": "g", "test_type": "arabic_factual"}]})
        rows = self.generator._parse(raw)
        self.assertEqual(len(rows), 1)


# ─────────────────────────────────────────────────────────────────────────────
# ArabicTestGenerator — validation and fill
# ─────────────────────────────────────────────────────────────────────────────

class TestValidateAndFill(unittest.TestCase):

    def setUp(self):
        self.generator = ArabicTestGenerator(judge_client=MagicMock())

    def test_all_arabic_test_types_present_in_output(self):
        # Empty LLM output → should fill from fallback for all types
        rows = self.generator._validate_and_fill([], "نموذج", num_tests=12)
        types_in_output = {r["test_type"] for r in rows}
        self.assertEqual(types_in_output, ARABIC_TEST_TYPES)

    def test_output_length_exactly_num_tests(self):
        rows = self.generator._validate_and_fill([], "chatbot", num_tests=18)
        self.assertEqual(len(rows), 18)

    def test_non_arabic_questions_filtered_out(self):
        bad_rows = [
            {"question": "What is the capital?", "ground_truth": "Cairo",
             "test_type": "arabic_factual"},
        ]
        rows = self.generator._validate_and_fill(bad_rows, "chatbot", num_tests=12)
        for r in rows:
            self.assertTrue(has_arabic(r["question"]),
                            f"Non-Arabic question slipped through: {r['question']!r}")

    def test_invalid_test_types_filtered_out(self):
        bad_rows = [
            {"question": "ما عاصمة مصر؟", "ground_truth": "القاهرة",
             "test_type": "invalid_type"},
        ]
        rows = self.generator._validate_and_fill(bad_rows, "chatbot", num_tests=12)
        types = {r["test_type"] for r in rows}
        self.assertNotIn("invalid_type", types)

    def test_good_rows_preserved(self):
        good = [
            {"question": "ما عاصمة مصر؟", "ground_truth": "القاهرة", "test_type": "arabic_factual"},
            {"question": "كيف تكتب رقم 5 بالعربية؟", "ground_truth": "خمسة", "test_type": "arabic_factual"},
        ]
        rows = self.generator._validate_and_fill(good, "chatbot", num_tests=12)
        questions = [r["question"] for r in rows]
        self.assertIn("ما عاصمة مصر؟", questions)

    def test_caps_at_num_tests(self):
        # Even if we have excess, output should be exactly num_tests
        many_rows = [
            {"question": f"سؤال رقم {i}؟", "ground_truth": f"إجابة {i}", "test_type": "arabic_factual"}
            for i in range(100)
        ]
        rows = self.generator._validate_and_fill(many_rows, "chatbot", num_tests=15)
        self.assertEqual(len(rows), 15)


# ─────────────────────────────────────────────────────────────────────────────
# ArabicTestGenerator — generate_arabic_suite (end-to-end with mocked LLM)
# ─────────────────────────────────────────────────────────────────────────────

class TestGenerateArabicSuite(unittest.TestCase):

    def _make_llm_response(self, n_per_type: int = 2) -> str:
        """Build a realistic mock LLM response with all six types."""
        tests = []
        for t in sorted(ARABIC_TEST_TYPES):
            if t == "arabic_consistency":
                # Must be in groups of 3
                for i in range(n_per_type * 3 // 3):
                    tests += [
                        {"question": f"ما عاصمة الدولة؟ (صياغة {i+1}أ)", "ground_truth": "أبوظبي", "test_type": t},
                        {"question": f"في أي مدينة الحكومة؟ (صياغة {i+1}ب)", "ground_truth": "أبوظبي", "test_type": t},
                        {"question": f"أخبرني عن عاصمة الإمارات (صياغة {i+1}ج)", "ground_truth": "أبوظبي", "test_type": t},
                    ]
            else:
                for i in range(n_per_type):
                    tests.append({
                        "question":     f"سؤال {t} رقم {i+1}؟",
                        "ground_truth": f"إجابة {t} رقم {i+1}",
                        "test_type":    t,
                    })
        return json.dumps({"tests": tests})

    def test_all_arabic_types_present(self):
        mock_client = MagicMock()
        mock_client.generate.return_value = self._make_llm_response(n_per_type=2)
        generator = ArabicTestGenerator(judge_client=mock_client)
        suite = generator.generate_arabic_suite("نموذج عربي", num_tests=20)
        types = {r["test_type"] for r in suite}
        self.assertEqual(types, ARABIC_TEST_TYPES)

    def test_output_length_respected(self):
        mock_client = MagicMock()
        mock_client.generate.return_value = self._make_llm_response(n_per_type=2)
        generator = ArabicTestGenerator(judge_client=mock_client)
        suite = generator.generate_arabic_suite("نموذج", num_tests=24)
        self.assertEqual(len(suite), 24)

    def test_all_questions_contain_arabic(self):
        mock_client = MagicMock()
        mock_client.generate.return_value = self._make_llm_response(n_per_type=2)
        generator = ArabicTestGenerator(judge_client=mock_client)
        suite = generator.generate_arabic_suite("نموذج عربي", num_tests=20)
        for row in suite:
            self.assertTrue(has_arabic(row["question"]),
                            f"Non-Arabic question: {row['question']!r}")

    def test_falls_back_gracefully_on_llm_failure(self):
        mock_client = MagicMock()
        mock_client.generate.side_effect = RuntimeError("API down")
        generator = ArabicTestGenerator(judge_client=mock_client)
        suite = generator.generate_arabic_suite("نموذج", num_tests=12)
        # Should not raise; should return fallback tests
        self.assertGreater(len(suite), 0)
        types = {r["test_type"] for r in suite}
        self.assertEqual(types, ARABIC_TEST_TYPES)

    def test_falls_back_gracefully_on_llm_empty_response(self):
        mock_client = MagicMock()
        mock_client.generate.return_value = ""
        generator = ArabicTestGenerator(judge_client=mock_client)
        suite = generator.generate_arabic_suite("نموذج", num_tests=12)
        self.assertGreater(len(suite), 0)

    def test_falls_back_gracefully_on_llm_invalid_json(self):
        mock_client = MagicMock()
        mock_client.generate.return_value = "I cannot help with that request."
        generator = ArabicTestGenerator(judge_client=mock_client)
        suite = generator.generate_arabic_suite("نموذج", num_tests=12)
        self.assertGreater(len(suite), 0)

    def test_auto_detect_arabic_description(self):
        """detect_language('نموذج عربي') → 'ar'  (integration path test)"""
        self.assertEqual(detect_language("نموذج عربي متعدد اللغات"), "ar")

    def test_callable_judge_client_works(self):
        """Judge client can be a bare callable."""
        def fake_client(prompt: str) -> str:
            return self._make_llm_response(n_per_type=2)

        generator = ArabicTestGenerator(judge_client=fake_client)
        suite = generator.generate_arabic_suite("نموذج", num_tests=12)
        self.assertGreater(len(suite), 0)

    def test_each_row_has_required_fields(self):
        mock_client = MagicMock()
        mock_client.generate.return_value = self._make_llm_response(n_per_type=2)
        generator = ArabicTestGenerator(judge_client=mock_client)
        suite = generator.generate_arabic_suite("نموذج", num_tests=20)
        for row in suite:
            self.assertIn("question",     row)
            self.assertIn("ground_truth", row)
            self.assertIn("test_type",    row)
            self.assertIn(row["test_type"], ARABIC_TEST_TYPES)


# ─────────────────────────────────────────────────────────────────────────────
# Specific Arabic stress-test content checks
# ─────────────────────────────────────────────────────────────────────────────

class TestArabicStressTestContent(unittest.TestCase):
    """Verify the fallback corpus contains the right *kinds* of stress tests."""

    def test_diacritics_has_fatha_kasra_damma(self):
        diacritics = [e for e in _FALLBACK_CORPUS if e[0] == "arabic_diacritics"]
        vowelled = [e[1] for e in diacritics if count_diacritics(e[1]) > 0]
        combined = " ".join(vowelled)
        # At least one of fatha (َ), kasra (ِ), damma (ُ) must be present
        has_fatha  = "\u064E" in combined
        has_kasra  = "\u0650" in combined
        has_damma  = "\u064F" in combined
        self.assertTrue(has_fatha or has_kasra or has_damma,
                        "Vowelled diacritics tests should contain fatha/kasra/damma")

    def test_dialect_covers_gulf_egyptian_levantine(self):
        dialect_tests = [e for e in _FALLBACK_CORPUS if e[0] == "arabic_dialect"]
        combined = " ".join(e[1] for e in dialect_tests)
        # Gulf: وش (what), Egyptian: إيه (what), Levantine: شو (what)
        self.assertIn("وش", combined,  "Missing Gulf dialect marker 'وش'")
        self.assertIn("إيه", combined, "Missing Egyptian dialect marker 'إيه'")
        self.assertIn("شو", combined,  "Missing Levantine dialect marker 'شو'")

    def test_rtl_tests_contain_mixed_script(self):
        rtl_tests = [e for e in _FALLBACK_CORPUS if e[0] == "arabic_rtl"]
        combined = " ".join(e[1] for e in rtl_tests)
        # Must contain some Latin characters mixed with Arabic
        has_latin  = bool(re.search(r"[a-zA-Z@.\d]", combined))
        self.assertTrue(has_latin, "RTL tests should contain Latin/digits for mix testing")

    def test_refusal_tests_target_harmful_categories(self):
        refusal_tests = [e for e in _FALLBACK_CORPUS if e[0] == "arabic_refusal"]
        combined = " ".join(e[1] for e in refusal_tests)
        # Should cover: sectarian, minors, coercion, hate, weapons
        self.assertIn("طائفية", combined, "Should include sectarian incitement test")
        self.assertIn("متفجرة", combined, "Should include explosives/weapons test")

    def test_refusal_ground_truths_decline_firmly(self):
        refusal_tests = [e for e in _FALLBACK_CORPUS if e[0] == "arabic_refusal"]
        for _, _, ground_truth in refusal_tests:
            # Ground truth should contain a refusal marker
            has_refusal = ("أرفض" in ground_truth or
                           "لا يمكنني" in ground_truth or
                           "لا أستطيع" in ground_truth)
            self.assertTrue(has_refusal,
                            f"Refusal ground truth doesn't refuse: {ground_truth!r}")

    def test_rtl_ground_truths_mention_rtl_context(self):
        rtl_tests = [e for e in _FALLBACK_CORPUS if e[0] == "arabic_rtl"]
        combined = " ".join(e[2] for e in rtl_tests)
        # At least one ground truth should mention RTL, direction, or HTML
        has_rtl_mention = ("RTL" in combined or
                           "اتجاه" in combined or   # direction
                           "HTML" in combined or
                           "dir=" in combined)
        self.assertTrue(has_rtl_mention, "RTL ground truths should mention RTL/direction concepts")


if __name__ == "__main__":
    unittest.main(verbosity=2)