# Privacy Policy — Reopen Tab Later

This extension works entirely on your device. We do not run servers and we do not send your data anywhere.

### What we store (locally, on your device)
- Scheduled tabs ("snoozes"): the page URL, optional page title, when you created it, and when it should reopen
<!-- Recurring schedules removed in simplified version -->
- Settings: simple options like whether to show a wake-up notification and your preferred hours for presets

### What we do not collect
- No analytics
- No browsing history scan
- No page content, form data, passwords, or cookies
- No account, email, or personal profile
- No data is sent to us or any third parties

### Where your data lives
- All data is saved in the browser's `chrome.storage.local` on your device
- It is not synced to your Google account
- It never leaves your machine unless you export it yourself

### How we use the data
- To reopen your saved tabs at the time you chose
- To show your list of upcoming tabs
- To compute the next time for presets
- To optionally show a desktop notification when a tab wakes

### Permissions and why they are needed
- `tabs`: read the current tab's URL/title to save it; open/close tabs when waking
- `storage`: save your schedules and settings locally
- `alarms`: wake up at the right time
- `notifications`: show a small notification when a tab reopens (optional)

We do not request host permissions for every site. The extension only touches the tab you act on.

### How to delete your data
- Open the extension's Settings (Options) and click "Delete all snoozes"
- Or remove the extension from your browser — the browser deletes its stored data
- You can also clear site data for the extension via your browser settings

### Incognito
- The extension does not run in Incognito.

### Network and third parties
- The extension makes no network requests to outside services
- No third-party SDKs or trackers are included

### Security notes
- Data is stored by the browser; we do not add extra encryption. Protect access to your device and browser profile
- URLs you save may be sensitive. Consider that anyone with access to your browser profile could view them

### Changes to this policy
- If this policy changes, we will update this file in the repository and the extension listing

### Questions
- Open an issue in this repository or contact us via the Chrome Web Store listing page
