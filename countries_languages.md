# Country to Local Languages Mapping

This document provides a comprehensive mapping of all **41 unique countries** (plus international/unspecified channels) present across the **963 channels** in `channels.json`, detailing official languages, local and regional languages, primary languages used for Islamic content/da'wah, and writing scripts.

---

## 📊 Summary Table

| # | Country | ISO Code | Channels | Official / National Language(s) | Local & Regional Languages | Primary Islamic & Da'wah Language(s) | Script(s) |
|---|---------|----------|----------|---------------------------------|-----------------------------|---------------------------------------|-----------|
| 1 | **Pakistan** | `PK` | 192 | Urdu, English | Punjabi, Pashto, Sindhi, Saraiki, Balochi, Hindko, Brahui | Urdu, Arabic, English, Punjabi, Pashto | Arabic (Nastaliq, Naskh), Latin |
| 2 | **United States** | `US` | 163 | English *(de facto)* | Spanish, Arabic, Somali, Urdu, Bosnian | English, Arabic, Spanish, Urdu | Latin, Arabic |
| 3 | **India** | `IN` | 145 | Hindi, English | Urdu, Bengali, Telugu, Marathi, Tamil, Gujarati, Malayalam, Kannada, Odia, Punjabi, Assamese, Kashmiri | Urdu, Hindi, English, Malayalam, Tamil, Bengali | Arabic (Nastaliq), Devanagari, Latin, Malayalam, Tamil, Bengali |
| 4 | **United Kingdom** | `GB` | 74 | English | Scots, Welsh, Gaelic, Urdu, Punjabi, Sylheti/Bengali, Arabic, Somali, Turkish | English, Urdu, Arabic, Bengali | Latin, Arabic |
| 5 | **Canada** | `CA` | 26 | English, French | Arabic, Punjabi, Urdu, Somali, Persian | English, Arabic, French, Urdu | Latin, Arabic |
| 6 | **United Arab Emirates** | `AE` | 25 | Arabic | English, Urdu, Hindi, Malayalam, Tagalog, Persian | Arabic, English, Urdu, Malayalam | Arabic (Naskh), Latin |
| 7 | **Saudi Arabia** | `SA` | 21 | Arabic | English, Tagalog, Urdu, Indonesian, Bengali | Arabic (Modern Standard & Gulf), English, Urdu | Arabic (Naskh) |
| 8 | **Australia** | `AU` | 19 | English | Arabic, Turkish, Indonesian, Urdu, Somali | English, Arabic, Turkish, Urdu | Latin, Arabic |
| 9 | **Bangladesh** | `BD` | 19 | Bengali | Chittagonian, Sylheti, Rangpuri, Rohingya, English | Bengali, Arabic, English | Bengali, Arabic |
| 10 | **Indonesia** | `ID` | 17 | Indonesian (*Bahasa Indonesia*) | Javanese, Sundanese, Madurese, Minangkabau, Buginese, Balinese | Indonesian, Arabic, Javanese, Sundanese | Latin, Arabic (Pegon) |
| 11 | **Malaysia** | `MY` | 7 | Malay (*Bahasa Melayu*) | English, Mandarin Chinese, Tamil, Kelantanese Malay, Iban | Malay, Arabic, English | Latin (Rumi), Arabic (Jawi) |
| 12 | **France** | `FR` | 6 | French | Maghrebi Arabic (Darija), Kabyle (Berber), Comorian, Turkish | French, Arabic | Latin, Arabic |
| 13 | **Kenya** | `KE` | 6 | Swahili (*Kiswahili*), English | Somali, Kikuyu, Luo, Luhya, Oromo | Swahili, English, Somali, Arabic | Latin, Arabic |
| 14 | **Netherlands** | `NL` | 5 | Dutch, Frisian | Moroccan Arabic (Darija), Tarifit (Berber), Turkish, English | Dutch, Arabic, Turkish, English | Latin, Arabic |
| 15 | **Egypt** | `EG` | 4 | Arabic | Egyptian Arabic (Masri), Sa'idi Arabic, Siwi (Berber), Nubian | Arabic (Modern Standard & Egyptian Arabic), English | Arabic (Naskh) |
| 16 | **Morocco** | `MA` | 4 | Arabic, Tamazight | Moroccan Arabic (Darija), Tashelhit, Central Atlas Tamazight, French, Spanish | Arabic (Standard & Darija), French, Tamazight | Arabic, Tifinagh, Latin |
| 17 | **Germany** | `DE` | 4 | German | Turkish, Arabic, Kurdish, Bosnian, English | German, Turkish, Arabic, English | Latin, Arabic |
| 18 | **South Africa** | `ZA` | 3 | English, Zulu, Xhosa, Afrikaans *(+8 official)* | Urdu, Gujarati, Arabic, Sotho, Tswana | English, Urdu, Arabic, Afrikaans | Latin, Arabic |
| 19 | **Sweden** | `SE` | 3 | Swedish | Arabic, Somali, Kurdish, Turkish, Finnish, English | Swedish, Arabic, English | Latin, Arabic |
| 20 | **Qatar** | `QA` | 3 | Arabic | English, Urdu, Hindi, Malayalam, Tagalog | Arabic, English, Urdu | Arabic, Latin |
| 21 | **Jordan** | `JO` | 3 | Arabic | Jordanian Arabic, Circassian, Armenian, English | Arabic (Modern Standard & Levantine), English | Arabic, Latin |
| 22 | **Norway** | `NO` | 2 | Norwegian | Somali, Arabic, Kurdish, Urdu, English | Norwegian, English, Somali, Arabic | Latin, Arabic |
| 23 | **Iraq** | `IQ` | 2 | Arabic, Kurdish | Iraqi Arabic, Turkmen, Neo-Aramaic (Syriac) | Arabic (Mesopotamian & Standard), Kurdish | Arabic (Naskh, Kurdish Sorani) |
| 24 | **Belgium** | `BE` | 2 | Dutch, French, German | Moroccan Arabic, Turkish, Berber, English | French, Dutch, Arabic | Latin, Arabic |
| 25 | **Mexico** | `MX` | 2 | Spanish | Nahuatl, Maya, Tzotzil, English, Arabic | Spanish, English, Arabic | Latin |
| 26 | **Italy** | `IT` | 2 | Italian | Moroccan Arabic, Bengali, Albanian, Urdu, French | Italian, Arabic, English | Latin, Arabic |
| 27 | **Nigeria** | `II / NG` | 2 | English | Hausa, Yoruba, Igbo, Fulfulde, Kanuri, Nupe | Hausa, English, Yoruba, Arabic | Latin, Arabic (Ajami) |
| 28 | **Palestine** | `PS` | 1 | Arabic | Palestinian Arabic, Levantine Arabic | Arabic (Modern Standard & Palestinian) | Arabic (Naskh) |
| 29 | **Malta** | `MT` | 1 | Maltese, English | Italian, Arabic | Maltese, English, Arabic | Latin (Maltese alphabet) |
| 30 | **China** | `CN` | 1 | Mandarin Chinese (*Standard Chinese*) | Uyghur, Kazakh, Hui (Mandarin), Kyrgyz, Tibetan | Mandarin Chinese, Uyghur, Arabic | Simplified Chinese, Arabic (Chagatai script for Uyghur / Xiao'erjing) |
| 31 | **Senegal** | `SN` | 1 | French | Wolof, Pulaar, Serer, Mandinka, Jola | Wolof, French, Arabic, Pulaar | Latin, Arabic (Wolofal) |
| 32 | **New Zealand** | `NZ` | 1 | English, Māori, NZ Sign Language | Samoan, Hindi, Arabic, Somali | English, Arabic | Latin |
| 33 | **Spain** | `ES` | 1 | Spanish | Catalan, Galician, Basque, Moroccan Arabic, Berber | Spanish, Arabic | Latin, Arabic |
| 34 | **Austria** | `AT` | 1 | German | Turkish, Bosnian/Croatian/Serbian, Arabic, English | German, Turkish, Bosnian, Arabic | Latin, Arabic |
| 35 | **Singapore** | `SG` | 1 | English, Malay, Mandarin, Tamil | Hokkien, Cantonese, Teochew | Malay, English, Tamil, Arabic | Latin, Simplified Chinese, Tamil |
| 36 | **South Korea** | `KR` | 1 | Korean | English, Arabic, Indonesian, Uzbek | Korean, English, Arabic | Hangul, Latin |
| 37 | **Kuwait** | `KW` | 1 | Arabic | Kuwaiti Arabic, English, Persian, Urdu | Arabic (Modern Standard & Gulf), English | Arabic, Latin |
| 38 | **Algeria** | `DZ` | 1 | Arabic, Tamazight | Algerian Arabic (Darja), Chaoui, Kabyle, French | Arabic (Standard & Darja), French, Tamazight | Arabic, Latin, Tifinagh |
| 39 | **Ghana** | `GH` | 1 | English | Akan (Twi/Fante), Dagbani, Hausa, Ewe, Ga | English, Hausa, Dagbani, Arabic | Latin, Arabic |
| 40 | **Bahrain** | `BH` | 1 | Arabic | Bahrani Arabic, English, Persian, Urdu, Malayalam | Arabic (Gulf), English | Arabic, Latin |
| 41 | **Japan** | `JP` | 1 | Japanese | English, Indonesian, Urdu, Turkish, Arabic | Japanese, English, Arabic | Kanji/Kana, Latin |
| 42 | *Unknown / Global / Online* | `XX` | 188 | Multi-national | English, Arabic, Urdu, Turkish, French, Spanish, Indonesian | English, Arabic, Urdu, Global languages | Multiple |

**Total Channels**: **963**  
**Total Identified Countries**: **41**

---

## 🌍 Regional Groupings & Linguistic Analysis

### 1. South Asia (356 Channels)
- **Countries**: Pakistan (192), India (145), Bangladesh (19).
- **Dominant Languages**: Urdu, Hindi, Bengali, English.
- **Regional Languages**: Punjabi, Pashto, Sindhi, Malayalam, Tamil, Telugu, Gujarati, Sylheti, Saraiki, Kashmiri.
- **Key Characteristics**: Largest concentration of channels in the dataset. Content often features Islamic lectures (durus), bayan, Quran recitations with Urdu/Bengali translations, and fiqh QA sessions.

### 2. North America & Europe (281 Channels)
- **Countries**: United States (163), United Kingdom (74), Canada (26), France (6), Netherlands (5), Germany (4), Sweden (3), Norway (2), Belgium (2), Italy (2), Spain (1), Austria (1), Malta (1).
- **Dominant Languages**: English, French, German, Dutch, Swedish, Italian, Spanish.
- **Diaspora Islamic Languages**: Arabic, Urdu, Turkish, Somali, Bosnian, Sylheti/Bengali, Maghrebi Darija.
- **Key Characteristics**: Very strong emphasis on English-language Islamic podcasts, youth counseling, interfaith discussions, debates, academic Islamic scholarship, and convert/revert stories.

### 3. Middle East & North Africa (MENA) (62 Channels)
- **Countries**: United Arab Emirates (25), Saudi Arabia (21), Egypt (4), Morocco (4), Qatar (3), Jordan (3), Iraq (2), Palestine (1), Kuwait (1), Algeria (1), Bahrain (1).
- **Dominant Languages**: Modern Standard Arabic (Fusha) alongside regional Arabic dialects (Gulf, Levantine, Egyptian, Darija/Maghrebi), Tamazight (Berber), French, and English.
- **Key Characteristics**: High proportion of classical Quran recitation (Tilawah), Hadith and Tafseer studies, Friday sermons (Khutbahs), and scholarly Islamic lectures.

### 4. Southeast Asia & East Asia (28 Channels)
- **Countries**: Indonesia (17), Malaysia (7), Singapore (1), China (1), South Korea (1), Japan (1).
- **Dominant Languages**: Indonesian (*Bahasa Indonesia*), Malay (*Bahasa Melayu*), Mandarin Chinese, Japanese, Korean, Uyghur.
- **Key Characteristics**: Rich traditions of Shafi'i jurisprudence, pesantren/madrasah culture, regional recitations, and emerging dawah outreach to East Asian societies.

### 5. Sub-Saharan Africa (12 Channels)
- **Countries**: Kenya (6), South Africa (3), Nigeria (2), Senegal (1), Ghana (1).
- **Dominant Languages**: Swahili, Hausa, English, Yoruba, Wolof, Zulu, Afrikaans, French, Arabic.
- **Key Characteristics**: Vibrant community dawah, Swahili and Hausa tafseer, cross-lingual educational programs.

### 6. Oceania & Latin America (22 Channels)
- **Countries**: Australia (19), New Zealand (1), Mexico (2).
- **Dominant Languages**: English, Spanish, Arabic.
- **Key Characteristics**: Dawah organizations catering to multicultural and multifaith societies.

---

## 📝 Integration Notes for Developer & Content Indexer
- The table above can be used for:
  - Localized channel filtering and tagging in `js/app.js`.
  - Country flag badges and locale-specific recommendation algorithms.
  - Multi-language search and query expansion (e.g. searching "Urdu" matches channels from Pakistan, India, UK, UAE).

