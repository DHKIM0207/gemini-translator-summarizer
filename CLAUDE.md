# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a Chrome Extension (Manifest V3) called "Gemini Translator & Summarizer" that provides webpage translation and summarization using Google's Gemini AI. The extension is built with vanilla JavaScript (ES6 modules) and requires no build process.

## Key Commands

### Development Workflow
1. **Load Extension**: Open `chrome://extensions`, enable Developer mode, click "Load unpacked" and select the project directory
2. **Reload Extension**: After code changes, click the reload button in `chrome://extensions`
3. **View Console Logs**:
   - Background script: Click "Inspect views: service worker" in extension details
   - Content scripts: Open browser DevTools on any webpage
   - Popup/Chatbot: Right-click the extension icon/chatbot and select "Inspect"

### Testing
- Manual testing only - load the unpacked extension and test features directly
- No automated test suite or test commands available

### Code Quality
- No linting or formatting tools configured
- Follow the existing code style:
  - 2-space indentation
  - camelCase for JavaScript variables/functions
  - kebab-case for CSS classes
  - UTF-8 encoding for all files

## Architecture Overview

### Extension Components

1. **Background Service Worker** (`background.js`)
   - Handles all Gemini API communication
   - Manages PDF URL interception and redirection
   - Processes messages between popup, content scripts, and chatbot
   - Uses ES6 modules for imports

2. **Content Scripts** (`content/content.js`)
   - Injected into all web pages
   - Handles text selection and drag translation
   - Extracts page content using Readability.js
   - Creates floating translation UI elements

3. **Popup Interface** (`popup.html/js`)
   - Main extension UI accessed via toolbar icon
   - Provides page summary and translation buttons
   - Manages API key storage
   - Language selector for multi-language support

4. **Chatbot UI** (`chatbot_ui/`)
   - Standalone chat interface with Gemini AI
   - Supports markdown rendering via marked.js
   - Image attachment and analysis capabilities
   - Fullscreen mode support

5. **PDF Viewer** (`pdf_viewer/`)
   - Custom PDF viewer using PDF.js
   - Intercepts PDF URLs and provides translation features
   - Supports page-by-page and selection-based translation

### Message Flow
1. User action (popup button click, text selection, etc.)
2. Content script or popup sends message to background script
3. Background script calls Gemini API with appropriate prompt
4. Response streamed back through message passing
5. UI updated with translated/summarized content

### Key Libraries
- `google-generative-ai.esm.js` - Gemini AI SDK
- `Readability.js` - Content extraction
- `marked.min.js` - Markdown rendering
- `pdf.min.js` - PDF rendering
- `i18n-helper.js` - Internationalization support

### Storage Structure
- API key stored in `chrome.storage.local`
- Selected language preference stored locally
- No server-side storage or external databases

### Internationalization
Supports 7 languages with full UI translation:
- Korean (ko) - default
- English (en)
- Chinese (zh)
- Japanese (ja)
- Spanish (es)
- French (fr)
- German (de)

Messages stored in `_locales/[lang]/messages.json`

## Important Considerations

1. **No Build Process**: Edit files directly, no compilation needed
2. **Chrome APIs**: Extension uses Manifest V3 APIs - check Chrome documentation for API changes
3. **Content Security Policy**: Strict CSP in place - external scripts not allowed
4. **Error Handling**: All Gemini API calls must include error handling
5. **Streaming Responses**: Large content uses streaming to avoid timeouts
6. **Web Accessible Resources**: Carefully manage resources exposed to web pages

## Recent Feature Additions
- Multi-language support (v3.3)
- ArXiv PDF support
- Improved drag translation icon positioning
- Enhanced PDF viewer loading

## Development Guidelines
- Always implement internationalization (i18n) when creating UI or text elements
  - Ensure all text is processed through localization system before rendering
  - Use `i18n-helper.js` for consistent multi-language support