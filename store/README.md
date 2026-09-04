# Store listings — OpenKey

Copy-paste metadata for every store this product ships to. Locales match the app: `en` `ar`.

| Store | Folder | Console |
|---|---|---|
| Chrome Web Store | [`chrome-web-store/card-details/`](chrome-web-store/card-details/) | https://chrome.google.com/webstore/devconsole |
| Firefox Add-ons | [`firefox-addons/card-details/`](firefox-addons/card-details/) | https://addons.mozilla.org/developers/ |
| Microsoft Edge Add-ons | [`edge-addons/card-details/`](edge-addons/card-details/) | https://partner.microsoft.com/dashboard/microsoftedge |

Regenerate from the org generator:

```bash
python3 /home/asim/Projects/OpenSelfHosing/store-listings/generate.py
```

## Field limits

| Field | Play | App Store / Mac | Microsoft | Snap | Flathub |
|---|---|---|---|---|---|
| Name | 30 | 30 | reserved product name | title ~40 | name (prefer &lt;20) |
| Subtitle | — | **30** (indexed) | — | — | — |
| Short / summary | **80** | — | **1000** (show **≤270**) | **&lt;80** | **≤35** |
| Promotional text | — | **170** | — | — | — |
| Keywords | — | **100 bytes**, comma-separated | 7 terms × 40 chars | desktop `Keywords=` | — |
| Full description | **4000** (indexed) | **4000** (not indexed) | **10000** | verbose Markdown | 3–10 short paragraphs |

Apple search only indexes **name + subtitle + keywords**. Do not put competitor names in Apple keywords.

## Shared URLs

- Privacy: https://openselfhosting.com/privacy
- Terms: https://openselfhosting.com/terms
- Pricing: https://openselfhosting.com/pricing
- Site: https://openselfhosting.com
- Support: security@openselfhosting.com
- Package ID: `com.openselfhosting.openkey`

## كيف ترفع التطبيق

كل مجلد متجر فيه `README.md` بخطوات الحساب، التوقيع، بناء الحزمة، لصق النصوص، والسياسات:

| متجر | الدليل |
|---|---|
| Chrome Web Store | [`chrome-web-store/README.md`](chrome-web-store/README.md) |
| Firefox Add-ons | [`firefox-addons/README.md`](firefox-addons/README.md) |
| Microsoft Edge Add-ons | [`edge-addons/README.md`](edge-addons/README.md) |

النصوص الجاهزة للحقول داخل `*/card-details/`.
