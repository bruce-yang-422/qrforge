# Caption fonts

Downloaded only when someone picks one of these fonts for the text below a code and their device has no system copy.

| File | Font | Source | License file |
| --- | --- | --- | --- |
| `noto-serif-tc.woff2` | Noto Serif TC Regular | https://github.com/notofonts/noto-cjk (`Serif/SubsetOTF/TC/NotoSerifTC-Regular.otf`) | `OFL-noto-serif-tc.txt` |
| `lxgw-wenkai-tc.woff2` | LXGW WenKai TC Regular | https://github.com/lxgw/LxgwWenkaiTC (`fonts/TTF/LXGWWenKaiTC-Regular.ttf`) | `OFL-lxgw-wenkai-tc.txt` |

Both are reduced to Big5, GB2312, Latin, punctuation and Bopomofo with `fonttools`, and saved as WOFF2. Other characters use the system's fonts.

The service worker keeps these across app versions, so give a changed font a new file name.
