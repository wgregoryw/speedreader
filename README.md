# SpeedReader

A modern speed reading application built with React that helps you read faster and comprehend better. Upload your EPUB, PDF, or TXT files and start speed reading with an intuitive interface.

![SpeedReader Screenshot](public/vite.svg)

## Features

- 📚 Support for multiple file formats (EPUB, PDF, TXT)
- ⚡ Fast and fluid reading experience
- 📖 Chapter navigation for EPUB files
- 🔍 Built-in dictionary lookup using [Free Dictionary API](https://dictionaryapi.dev/)
- 💾 Auto-save reading progress
- 🎯 Click any word to start reading from that position
- ⏯️ Play/Pause/Reset controls
- 📱 Responsive design for all screen sizes

## Getting Started

### Prerequisites

- Node.js 18 or higher
- npm or yarn

### Installation

1. Clone the repository:
```bash
git clone https://github.com/YOUR_USERNAME/speedreader.git
cd speedreader
```

2. Install dependencies:
```bash
npm install
```

3. Start the development server:
```bash
npm run dev
```

4. Build for production:
```bash
npm run build
```

## Usage

1. Click "Import File" to upload your EPUB, PDF, or TXT file
2. Use the play button to start speed reading
3. Adjust your reading position by clicking any word in the preview
4. Look up word definitions using the "Define" button
5. Navigate between chapters using the sidebar (for EPUB files)

## Development

Built with:
- React 19
- Vite 6
- Material-UI 7
- epub.js
- PDF.js

## Deployment

The project is configured for GitHub Pages deployment. Push to the main branch to trigger automatic deployment.

## Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit your changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

## License

This project is licensed under the GNU General Public License v3.0 - see the LICENSE file for details. This means:
- You can freely use, modify, and distribute this software
- Any modifications must also be released under the GPL
- The software comes with no warranty
- You must include the license and copyright notice with all copies

## Acknowledgments

- [Free Dictionary API](https://dictionaryapi.dev/) for word definitions
- [epub.js](https://github.com/futurepress/epub.js/) for EPUB file support
- [PDF.js](https://mozilla.github.io/pdf.js/) for PDF file support
