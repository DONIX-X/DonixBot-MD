# DONIX | Donix Bot MD

An open-source, multi-device WhatsApp bot by [DONIX](https://github.com/DONIX-X), built with [Baileys](https://github.com/WhiskeySockets/Baileys). Donix Bot MD brings group administration, moderation, and chat utilities together in one Node.js project.

<div align="center"> 
  <img src="assets/bot_image.jpg" alt="DONIX Bot MD logo" width="420">
</div>

<div align="center">
  <a href="https://github.com/DONIX-X/DonixBot-MD/actions/workflows/ci.yml"><img src="https://github.com/DONIX-X/DonixBot-MD/actions/workflows/ci.yml/badge.svg" alt="CI status"/></a>
  <img src="https://img.shields.io/github/followers/DONIX-X?style=for-the-badge&label=Followers" alt="Followers"/>
  <img src="https://img.shields.io/github/stars/DONIX-X/DonixBot-MD?style=for-the-badge&label=Stars" alt="Stars"/>
  <img src="https://img.shields.io/github/forks/DONIX-X/DonixBot-MD?style=for-the-badge&label=Forks" alt="Forks"/>
  <img src="https://img.shields.io/github/watchers/DONIX-X/DonixBot-MD?style=for-the-badge&label=Watchers" alt="Watchers"/>
</div>

---
## Community

<div align="center">
  <a href="https://t.me/+3QhFUZHx-nhhZmY1">
    <img src="https://img.shields.io/badge/Join%20Telegram-0078E7?style=for-the-badge&logo=telegram&logoColor=white" alt="Join Telegram"/>
  </a>
  <a href="https://whatsapp.com/channel/0029Vb9eTDY1CYoMSAu3Jv0o">
    <img src="https://img.shields.io/badge/Join%20WhatsApp-25D366?style=for-the-badge&logo=whatsapp&logoColor=white" alt="Join WhatsApp"/>
  </a>
</div>

---

## ⚙️ Features

- **Tag all group members** with the `.tagall` command
- **Admin restricted usage** (Only group admins can use certain commands)
- **Text-to-Speech** with `.tts`
- **Sticker creation** with `.sticker`
- **Anti-link detection** for group safety
- **Warn and manage group members** with admin control
- **Utility, media, and AI commands** for group and direct chats

---

## 📖 About

Donix Bot MD is maintained by DONIX and uses Baileys to connect to WhatsApp's multi-device service. It is a community project and is not an official WhatsApp product.

---

## Quick Start

### Requirements

- Node.js 18 or newer
- Git

### Install

1. Clone the repository and install dependencies:

    ```bash
    git clone https://github.com/DONIX-X/DonixBot-MD.git
    cd DonixBot-MD
    npm install
    ```

2. Start with a pairing code. Use your full international phone number with digits only:

   **Windows PowerShell**
   ```powershell
   $env:PHONE_NUMBER = "15551234567"
   npm start
   ```

   **Linux or macOS**
   ```bash
   PHONE_NUMBER=15551234567 npm start
   ```

   Enter the pairing code shown in the terminal in WhatsApp's Linked Devices settings.

3. To use QR login instead, run `npm run start:qr` and scan the QR code shown in the terminal using WhatsApp's Linked Devices settings.

Keep your session files and pairing codes private. Never commit them or share them in issue reports.

---

## ☕ Support Me

<div align="center">

<a href="https://github.com/DONIX-X" target="_blank">
  <img src="https://img.shields.io/badge/Buy%20Me%20a%20Coffee-Support%20Developer-FF813F?style=for-the-badge&logo=buy-me-a-coffee&logoColor=white" alt="Buy Me a Coffee">
</a>

</div>

If you find this project helpful and want to support the developer, consider buying me a coffee! Your support helps maintain and improve this open-source project.

<div align="center">

<img src="assets/bmc_qr.png" alt="Buy Me a Coffee QR Code" width="200">

</div>

---

## License

This project is licensed under the [ISC License](LICENSE).

---

## 🙌 Contributions

Contributions, issues, and feature requests are welcome! Feel free to check the [issues page](https://github.com/DONIX-X/DonixBot-MD/issues).

---

## Support

If Donix Bot MD is useful to you, consider starring the repository or supporting DONIX through [Buy Me a Coffee](https://buymeacoffee.com/DONIX-X).


## Credits

- [DONIX](https://github.com/DONIX-X)
- [Baileys](https://github.com/adiwajshing/Baileys)
- [TechGod143](https://github.com/TechGod143) for pair code
- [Dgxeon](https://github.com/Dgxeon) for pair code

---

## Important Notice

**Note:** This bot is created for educational purposes only. This is NOT an official WhatsApp bot. Using this bot may lead to your WhatsApp account being banned. Use it at your own risk. The developers will not be responsible for any consequences or account bans that may occur while using this bot.

## 📝 Legal

- This project is not affiliated with, authorized, maintained, sponsored or endorsed by WhatsApp or any of its affiliates or subsidiaries.
- This is an independent and unofficial software. Use at your own risk.
- Do not spam people with this bot.
- Do not use this bot to send bulk messages or for illegal purposes.
- The developers assume no liability and are not responsible for any misuse or damage caused by this program.

## 📜 Copyright Notice

Copyright (c) 2024 DONIX. All rights reserved.

This project contains code from various open source projects:
- Baileys (MIT License)
- Other libraries as listed in package.json
