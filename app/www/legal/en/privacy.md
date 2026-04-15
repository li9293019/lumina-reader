# {{APP_NAME}} Privacy Policy

**Version: v2.0 | Effective Date: {{EFFECTIVE_DATE}}**

## Introduction

{{APP_NAME}} (hereinafter referred to as "the Software") is developed and operated by {{DEVELOPER_NAME}}. The Software places a high value on user privacy protection and adopts a **pure local-first architecture**, meaning the vast majority of user data is stored only on your device.

## 1. Developer Information

- **Developer Name**: {{DEVELOPER_NAME}}
- **Contact Email**: {{CONTACT_EMAIL}}
- **Feedback Channels**: In-app "About" page / GitHub Issues (https://github.com/{{GITHUB_USERNAME}}/lumina-reader/issues)

## 2. Information We Collect

### 2.1 Locally Stored Data
The following data is stored only on your device and is not uploaded to any server:
- Book documents you actively import
- Reading progress, bookmarks, annotations, and heatmap data
- Custom font files
- Application setting preferences (theme, typography, TTS configuration, etc.)

### 2.2 Technical Log Information
When the application encounters an abnormal crash, the system may collect **anonymized crash logs** (which do not contain any personally identifiable information) to help diagnose technical issues. This information is stored locally only and is not automatically uploaded.

### 2.3 Third-Party Service Interactions
The following features involve data interaction with third-party services:
- **Text-to-Speech (TTS)**: When you use Azure TTS, the current paragraph text being read is transmitted via an encrypted channel to the **Microsoft Azure Speech Service** for synthesis. We only transmit the necessary text when you actively enable reading, and we do not persistently store it.

## 3. App Permissions

The system permissions required by the Software and their purposes are as follows:

- **INTERNET**: Used to check for app updates, load online font resources, and access the Azure TTS speech synthesis service.
- **WAKE_LOCK / FOREGROUND_SERVICE**: Used to ensure background text-to-speech (TTS) is not interrupted by the system.
- **REQUEST_IGNORE_BATTERY_OPTIMIZATIONS**: Used to request a battery optimization whitelist from the system to ensure stable background TTS operation.
- **BLUETOOTH**: Used to respond to play/pause button events on Bluetooth headsets.

**Special Note**: The Software **does not request read/write external storage permissions**. All book imports are completed through the Android system file picker (SAF) based on your active selection; export operations are completed through the system share/save dialog.

## 4. Third-Party SDKs and Services

| Service Name | Type | Purpose | Privacy Policy Link |
| --- | --- | --- | --- |
| Microsoft Azure Cognitive Services | Speech Synthesis | Provides text-to-speech (TTS) capabilities | https://privacy.microsoft.com/en-us/privacystatement |
| Capacitor (provided by Ionic) | Cross-Platform Runtime Framework | Provides Web-to-App bridging capabilities | https://ionic.io/privacy |

## 5. How We Protect Your Information

1. **Pure Local Storage**: Your reading data, book files, and annotation content are saved only in the device's local database or private directory by default.
2. **App Sandbox Isolation**: The Android app sandbox mechanism prevents other apps from accessing the Software's data.
3. **Encrypted Backups**: Your exported .lmn backup files are encrypted using AES-256-GCM and require a password to decrypt.
4. **No Account System**: The Software does not register or collect any user accounts or identity information.

## 6. Your Rights

You have the following rights regarding your data:

1. **Review and Export**: Through "Settings → Data Management → Export", you can export your books and configuration data as a .lmn backup file at any time.
2. **Deletion**: Through "Settings → Data Management → Clear All Data", you can delete all local data with one click; uninstalling the app will also completely remove all residual data.
3. **Withdraw Consent**: You can turn off the TTS feature in the app settings at any time to stop transmitting text data to Azure.

## 7. Protection of Minors

The Software does not provide specialized services for minors under the age of 14. If you are the guardian of a minor and discover that the minor has used the Software without consent, please contact us at {{CONTACT_EMAIL}} and we will assist you in deleting the relevant data.

## 8. Policy Updates

We may update this policy in accordance with legal and regulatory requirements or product feature changes. The updated policy will be published on the in-app "About" page or GitHub Release, and the **Effective Date** will be updated accordingly. If you continue to use the Software, it is deemed that you agree to the updated policy.

## 9. Contact Us

If you have any questions, comments, or suggestions regarding this Privacy Policy, please contact us through the following channels:

- **Email**: {{CONTACT_EMAIL}}
- **Project Homepage**: https://github.com/{{GITHUB_USERNAME}}/lumina-reader

---

**Our promise: Your reading belongs only to you.**
