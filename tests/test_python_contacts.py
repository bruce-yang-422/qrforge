"""CLI payload and real CSV/Excel export checks. Run with unittest discovery."""
import copy
import csv
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from openpyxl import Workbook, load_workbook

import main


ROOT = Path(__file__).resolve().parents[1]


class ContactPayloadTests(unittest.TestCase):
    def test_email_encodes_subject_body_and_dedicated_recipient(self):
        row = {"類型": "email", "Email": "service+tag@example.com", "主旨": "報價 & 問題", "內文": "第一行\n第二行"}
        payload = main.format_qr_data(main.normalize_row(row))
        self.assertEqual(payload, "mailto:service%2Btag@example.com?subject=%E5%A0%B1%E5%83%B9%20%26%20%E5%95%8F%E9%A1%8C&body=%E7%AC%AC%E4%B8%80%E8%A1%8C%0A%E7%AC%AC%E4%BA%8C%E8%A1%8C")
        self.assertEqual(main.format_qr_data({"type": "email", "data": "a@example.com", "email": "b@example.com"}), "mailto:a@example.com?subject=&body=")

    def test_phone_country_codes_and_legacy_data(self):
        cases = [
            ({"country": "+886", "phone": "0912-345-678"}, "tel:+886912345678"),
            ({"country": "39", "phone": "0612345678"}, "tel:+390612345678"),
            ({"country": "+886", "phone": "+1 (202) 555-0123"}, "tel:+12025550123"),
            ({"data": "+886 912 345 678"}, "tel:+886912345678"),
        ]
        for row, expected in cases:
            with self.subTest(row=row):
                self.assertEqual(main.format_qr_data({"type": "phone", **row}), expected)
        with self.assertRaises(ValueError):
            main.format_qr_data({"type": "phone", "country": "invalid", "phone": "0912345678"})

    def test_sms_preserves_multiline_body(self):
        self.assertEqual(main.format_qr_data({"type": "sms", "country": "886", "phone": "0912345678", "body": "A&B\nC?"}), "sms:+886912345678?body=A%26B%0AC%3F")

    def test_vcard_names_and_structural_characters(self):
        row = main.normalize_row({"類型": "vcard", "姓": "王", "名": "小明", "暱稱": "Tom", "公司": "研發;部門,一\\二\n三", "國碼": "+886", "電話號碼": "0912345678", "Email": "ming@example.com", "網站": "https://example.com"})
        self.assertEqual(main.format_qr_data(row), "\r\n".join([
            "BEGIN:VCARD", "VERSION:3.0", "N:王;小明;;;", "FN:王小明 Tom", "NICKNAME:Tom",
            "ORG:研發\\;部門\\,一\\\\二\\n三", "TITLE:", "TEL:+886912345678", "EMAIL:ming@example.com", "URL:https://example.com", "END:VCARD",
        ]))
        row["displayName"] = "業務窗口"
        self.assertIn("FN:業務窗口\r\n", main.format_qr_data(row))
        self.assertIn("N:;李小華;;;\r\nFN:李小華", main.format_qr_data(main.normalize_row({"類型": "vcard", "姓名": "李小華"})))

    def test_empty_contacts_are_skipped(self):
        for kind in ("vcard", "email", "phone", "sms"):
            with self.subTest(kind=kind):
                self.assertEqual(main.format_qr_data({"type": kind}), "")


class BatchContactTests(unittest.TestCase):
    def test_required_header_validation(self):
        for headers in (["類型"], ["type"], [" type "]):
            main.validate_columns(headers)
        for headers in (None, [], ["資料"]):
            with self.subTest(headers=headers), self.assertRaises(ValueError):
                main.validate_columns(headers)
        self.assertEqual(main.normalize_row({" type ": " phone ", " 電話號碼 ": "0912345678"}), {"type": "phone", "phone": "0912345678"})

    def test_templates_match_and_contain_all_types(self):
        with (ROOT / "assets/sample.csv").open(encoding="utf-8-sig", newline="") as source:
            csv_rows = list(csv.reader(source))
        workbook = load_workbook(ROOT / "assets/sample.xlsx")
        try:
            excel_rows = [[str(value) if value is not None else "" for value in row] for row in workbook.active.values]
            self.assertEqual(csv_rows, excel_rows)
            self.assertTrue({"vcard", "email", "phone", "sms"}.issubset({row[0] for row in csv_rows[1:]}))
            for row in workbook.active.iter_rows(min_row=2):
                for header, cell in zip(csv_rows[0], row):
                    if header in ("國碼", "電話號碼") and cell.value:
                        self.assertIsInstance(cell.value, str)
                        self.assertEqual(cell.number_format, "@")
        finally:
            workbook.close()

    def test_csv_bom_excel_and_real_image_exports(self):
        rows = [
            {"type": "phone", "country": "+886", "phone": "0912345678", "name": "phone"},
            {"type": "sms", "data": "+886912345678", "body": "第一行\n第二行 & ?", "name": "sms"},
            {"type": "email", "email": "a@example.com", "subject": "測試 & 報價", "body": "您好\n請報價", "name": "email"},
            {"type": "vcard", "family": "王", "given": "小明", "org": "公司;部門", "name": "vcard"},
        ]
        headers = list(dict.fromkeys(key for row in rows for key in row))
        with tempfile.TemporaryDirectory() as temp:
            csv_path = Path(temp) / "contacts.csv"
            with csv_path.open("w", encoding="utf-8-sig", newline="") as output:
                writer = csv.DictWriter(output, fieldnames=headers)
                writer.writeheader()
                writer.writerows(rows)
            workbook = Workbook()
            workbook.active.append(headers)
            for row in rows:
                workbook.active.append([row.get(header, "") for header in headers])
            excel_path = Path(temp) / "contacts.xlsx"
            workbook.save(excel_path)
            workbook.close()
            expected = [(main.format_qr_data(row), row["name"]) for row in rows]
            for processor, source in [(main.process_csv, csv_path), (main.process_excel, excel_path)]:
                for fmt in ("PNG", "JPG", "SVG"):
                    with self.subTest(source=source.suffix, format=fmt):
                        config = copy.deepcopy(main.load_config())
                        config["paths"]["output_dir"] = temp
                        config["output"]["format"] = fmt
                        with patch.object(main, "save_qr", wraps=main.save_qr) as save:
                            processor(source, config)
                        self.assertEqual([(call.args[0], call.args[1]) for call in save.call_args_list], expected)
                        for row in rows:
                            path = Path(temp) / f"{row['name']}.{fmt.lower()}"
                            self.assertGreater(path.stat().st_size, 50)
                            if fmt != "SVG":
                                with main.Image.open(path) as image:
                                    image.verify()

    def test_bad_row_does_not_stop_following_contacts(self):
        with tempfile.TemporaryDirectory() as temp:
            source = Path(temp) / "bad-country.csv"
            source.write_text("類型,國碼,電話號碼,Qr-code檔案名稱\nphone,invalid,0912345678,bad\nphone,+886,0912345678,good\n", encoding="utf-8")
            with self.assertLogs(level="ERROR"), patch.object(main, "save_qr") as save:
                main.process_csv(source, {})
            self.assertEqual(save.call_count, 1)
            self.assertEqual(save.call_args.args[:2], ("tel:+886912345678", "good"))


if __name__ == "__main__":
    unittest.main()
