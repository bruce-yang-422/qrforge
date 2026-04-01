CONFIG = {
    "paths": {
        "input_dir": "input",    # 輸入資料夾，放置 csv / xlsx / txt 來源檔案
        "output_dir": "output",  # 輸出資料夾，QR code 圖片存放位置
        "log_dir": "logs",       # 執行紀錄存放位置，每次執行會清空並重新產生
    },
    "qr": {
        "error_correction": "M", # 容錯等級：L(7%) / M(15%) / Q(25%) / H(30%)
                                 # 等級越高可容許破損越多，但圖案越複雜
        "scale": 8,              # 每個 QR 格放大倍數（px），建議 5–20
    },
    "output": {
        "format": "SVG",         # 輸出格式：PNG / JPG / SVG
    },
    "csv": {
        "delimiter": ",",        # CSV 欄位分隔符號，TSV 請改為 "\t"
    },
}
