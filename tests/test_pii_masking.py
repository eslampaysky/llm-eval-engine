"""Unit tests for PII masking in gemini_judge.py."""

import os
import sys
import unittest

BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if BASE not in sys.path:
    sys.path.insert(0, BASE)

from core.gemini_judge import _mask_pii


class TestMaskPII(unittest.TestCase):

    def test_email_masked(self):
        text = "Contact us at john.doe@example.com for info."
        result = _mask_pii(text)
        self.assertNotIn("john.doe@example.com", result)
        self.assertIn("<USER_EMAIL>", result)

    def test_multiple_emails(self):
        text = "From alice@test.org to bob+tag@gmail.com"
        result = _mask_pii(text)
        self.assertEqual(result.count("<USER_EMAIL>"), 2)
        self.assertNotIn("alice@test.org", result)
        self.assertNotIn("bob+tag@gmail.com", result)

    def test_phone_masked(self):
        text = "Call us at +1-555-123-4567 or (555) 987-6543"
        result = _mask_pii(text)
        self.assertNotIn("555-123-4567", result)
        self.assertIn("<PHONE>", result)

    def test_credit_card_visa(self):
        text = "Card: 4111 1111 1111 1111"
        result = _mask_pii(text)
        self.assertNotIn("4111", result)
        self.assertIn("<CARD>", result)

    def test_credit_card_mastercard(self):
        text = "MC: 5500-0000-0000-0004"
        result = _mask_pii(text)
        self.assertNotIn("5500", result)
        self.assertIn("<CARD>", result)

    def test_clean_text_unchanged(self):
        text = "This is a normal web page about cooking recipes."
        result = _mask_pii(text)
        self.assertEqual(result, text)

    def test_mixed_pii(self):
        text = (
            "User email: test@example.com, phone: +44 20 7946 0958, "
            "card: 4242424242424242"
        )
        result = _mask_pii(text)
        self.assertIn("<USER_EMAIL>", result)
        self.assertIn("<PHONE>", result)
        self.assertIn("<CARD>", result)
        self.assertNotIn("test@example.com", result)

    def test_url_not_masked(self):
        text = "Visit https://example.com/page?id=123 for details"
        result = _mask_pii(text)
        self.assertIn("https://example.com", result)


if __name__ == "__main__":
    unittest.main(verbosity=2)
