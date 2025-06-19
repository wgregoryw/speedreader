import React, { useRef, useState, useEffect } from 'react';
import { Container, Typography, Box, Button, Input, Paper } from '@mui/material';
import ePub from 'epubjs';
import * as pdfjsLib from 'pdfjs-dist';
import './App.css';

// Set PDF.js workerSrc to CDN for Vite compatibility
pdfjsLib.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.js`;

function App() {
  const fileInputRef = useRef();
  const previewBoxRef = useRef();
  // Add a ref to track pending resume state
  const pendingResumeRef = useRef(null);
  const [fileName, setFileName] = useState('');
  const [error, setError] = useState('');
  const [fileContent, setFileContent] = useState('');
  const [words, setWords] = useState([]);
  const [currentWordIdx, setCurrentWordIdx] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [intervalId, setIntervalId] = useState(null);
  const [loading, setLoading] = useState(false);
  const [chapters, setChapters] = useState([]); // [{title, text, index}]
  const [selectedChapterIdx, setSelectedChapterIdx] = useState(null);
  const [chapterWords, setChapterWords] = useState([]);
  const [showChapters, setShowChapters] = useState(true);
  const [selectedWord, setSelectedWord] = useState(null);
  const [selectedWordIdx, setSelectedWordIdx] = useState(null);
  const [showDictionary, setShowDictionary] = useState(false);
  const [dictionaryUrl, setDictionaryUrl] = useState('');
  const [dictionaryDefinition, setDictionaryDefinition] = useState('');
  const [showResumePrompt, setShowResumePrompt] = useState(false);
  const [resumeState, setResumeState] = useState(null);

  const parseTxt = (file) => {
    setLoading(true);
    const reader = new FileReader();
    reader.onload = (e) => {
      setFileContent(e.target.result);
      setWords(e.target.result.split(/\s+/));
      setCurrentWordIdx(0);
      setLoading(false);
    };
    reader.onerror = (e) => {
      setError('Failed to read TXT file.');
      setLoading(false);
    };
    reader.readAsText(file);
  };

  // Utility: Clean and preserve paragraphs from HTML (optimized)
  function extractCleanTextFromHTML(html) {
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');
    // Only use paragraphs and list items for main text
    let blocks = Array.from(doc.querySelectorAll('p, li'));
    let text = '';
    for (let el of blocks) {
      let t = el.textContent;
      if (t && t.replace(/\s+/g, '').length > 0) {
        text += t + '\n\n';
      }
    }
    // Fallback: if no blocks, use body text
    if (!text.trim()) {
      text = doc.body ? doc.body.textContent : '';
    }
    // Normalize whitespace
    text = text.replace(/\n{3,}/g, '\n\n'); // No more than 2 line breaks
    text = text.replace(/[ \t]+/g, ' ');
    text = text.replace(/([.!?])([^ \n])/g, '$1 $2'); // Ensure space after punctuation
    return text.trim();
  }

  const parseEpub = async (file) => {
    setLoading(true);
    setError('');
    let timeoutId;
    try {
      const book = ePub();
      await book.open(file);
      await book.ready;
      timeoutId = setTimeout(() => {
        setError('EPUB parsing timed out. This file may be incompatible.');
        setLoading(false);
      }, 20000); // 20s timeout for large books
      let chapterArr = [];
      try {
        const spineItems = book.spine.spineItems;
        const toc = await book.loaded.navigation;
        for (let i = 0; i < spineItems.length; i++) {
          const item = spineItems[i];
          let sectionText = '';
          let title = `Chapter ${i + 1}`;
          // Try to get title from TOC if possible
          if (toc && toc.toc) {
            const nav = toc.toc.find(t => t.href && item.href && t.href.endsWith(item.href));
            if (nav && nav.label) title = nav.label.trim();
          }
          try {
            await item.load(book.load.bind(book));
            try {
              const html = await item.render();
              sectionText = extractCleanTextFromHTML(html);
            } catch (renderErr) {
              sectionText = extractCleanTextFromHTML(await item.text());
            }
            item.unload();
          } catch (itemErr) {
            // skip
          }
          if (sectionText && sectionText.trim().length > 0) {
            chapterArr.push({ title, text: sectionText, index: i });
          }
        }
      } catch (err) {
        setError('Failed to extract chapters from EPUB.');
        setLoading(false);
        clearTimeout(timeoutId);
        return;
      }
      clearTimeout(timeoutId);
      if (chapterArr.length === 0) {
        setError('No chapters found in EPUB.');
        setChapters([]);
        setSelectedChapterIdx(null);
        setChapterWords([]);
        setFileContent('');
        setWords([]);
      } else {
        setChapters(chapterArr);
        setSelectedChapterIdx(0);
        setChapterWords(chapterArr[0].text.split(/\s+/));
        setCurrentWordIdx(0);
        setFileContent(''); // Don't show full text
        setWords([]);
      }
      setLoading(false);
    } catch (err) {
      clearTimeout(timeoutId);
      setError('Failed to parse EPUB file: ' + (err?.message || err));
      setLoading(false);
    }
  };

  const parsePdf = async (file) => {
    setLoading(true);
    try {
      const reader = new FileReader();
      reader.onload = async (e) => {
        try {
          const typedarray = new Uint8Array(e.target.result);
          const pdf = await pdfjsLib.getDocument({ data: typedarray }).promise;
          let text = '';
          for (let i = 1; i <= pdf.numPages; i++) {
            const page = await pdf.getPage(i);
            const content = await page.getTextContent();
            text += content.items.map((item) => item.str).join(' ') + ' ';
          }
          setFileContent(text);
          setWords(text.split(/\s+/));
          setCurrentWordIdx(0);
          setLoading(false);
        } catch (err) {
          setError('Failed to parse PDF file.');
          setLoading(false);
        }
      };
      reader.onerror = (e) => {
        setError('Failed to read PDF file.');
        setLoading(false);
      };
      reader.readAsArrayBuffer(file);
    } catch (err) {
      setError('Failed to parse PDF file.');
      setLoading(false);
    }
  };

  const handleFileChange = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setFileName(file.name);
    setError('');
    const ext = file.name.split('.').pop().toLowerCase();
    if (ext === 'txt') {
      parseTxt(file);
    } else if (ext === 'epub') {
      parseEpub(file);
    } else if (ext === 'pdf') {
      parsePdf(file);
    } else {
      setError('Unsupported file type.');
    }
    // Do not restore state here; handled by resume logic
  };

  const handleImportClick = () => {
    fileInputRef.current.click();
  };

  const handlePlay = () => {
    if (chapterWords.length === 0) return;
    setIsPlaying(true);
    setShowChapters(false); // Minimize chapters when play is clicked
    if (intervalId) return;
    let idxRef = currentWordIdx;
    const id = setInterval(() => {
      idxRef++;
      setCurrentWordIdx((prevIdx) => {
        if (prevIdx < chapterWords.length - 1) {
          return prevIdx + 1;
        } else {
          clearInterval(id);
          setIsPlaying(false);
          setIntervalId(null);
          return prevIdx;
        }
      });
    }, 200); // 200ms per word (300wpm)
    setIntervalId(id);
  };

  const handlePause = () => {
    setIsPlaying(false);
    if (intervalId) {
      clearInterval(intervalId);
      setIntervalId(null);
    }
  };

  const handleReset = () => {
    setCurrentWordIdx(0);
    handlePause();
  };

  // When a chapter is selected, update chapterWords and reset speed reading
  const handleSelectChapter = (idx) => {
    setSelectedChapterIdx(idx);
    setChapterWords(chapters[idx].text.split(/\s+/));
    setCurrentWordIdx(0);
    setIsPlaying(false);
    if (intervalId) clearInterval(intervalId);
    setIntervalId(null);
  };

  // When a word is clicked in the preview, set the speed reading cursor and allow dictionary lookup
  const handleWordClick = (idx) => {
    setCurrentWordIdx(idx);
    setIsPlaying(false);
    if (intervalId) clearInterval(intervalId);
    setIntervalId(null);
    setSelectedWord(chapterWords[idx]);
    setSelectedWordIdx(idx);
    setShowDictionary(false);
  };

  const handleDictionaryLookup = async () => {
    if (chapterWords.length > 0 && currentWordIdx >= 0 && currentWordIdx < chapterWords.length) {
      const word = chapterWords[currentWordIdx];
      setSelectedWord(word);
      setSelectedWordIdx(currentWordIdx);
      setShowDictionary(true);
      setDictionaryDefinition('');
      // Fetch definition directly from the dictionary API
      try {
        const response = await fetch(`https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(word)}`);
        if (response.ok) {
          const data = await response.json();
          const meanings = data[0]?.meanings || [];
          if (meanings.length > 0) {
            const definition = meanings[0].definitions[0].definition;
            setDictionaryDefinition(definition || 'No definition found.');
          } else {
            setDictionaryDefinition('No definition found.');
          }
        } else {
          setDictionaryDefinition('No definition found.');
        }
      } catch (e) {
        setDictionaryDefinition('Error fetching definition.');
      }
    }
  };

  // Scroll preview to current word ONLY when playing
  useEffect(() => {
    if (!isPlaying) return; // Only scroll when playing
    if (previewBoxRef.current) {
      const wordSpan = previewBoxRef.current.querySelector(`span[data-word-idx='${currentWordIdx}']`);
      if (wordSpan) {
        // Only scroll the preview box, not the whole page
        // Use scrollIntoView with behavior: 'auto' to avoid jank
        wordSpan.scrollIntoView({ block: 'center', behavior: 'auto', inline: 'nearest' });
      }
    }
  }, [currentWordIdx, isPlaying]);

  // Save reading state to localStorage
  useEffect(() => {
    if (!fileName) return;
    const state = {
      fileName,
      selectedChapterIdx,
      currentWordIdx,
      showChapters,
    };
    localStorage.setItem('speedreaderState', JSON.stringify(state));
  }, [fileName, selectedChapterIdx, currentWordIdx, showChapters]);

  // Restore reading state from localStorage on mount
  useEffect(() => {
    const saved = localStorage.getItem('speedreaderState');
    if (saved) {
      try {
        const state = JSON.parse(saved);
        if (state.fileName) {
          setResumeState(state);
          setShowResumePrompt(true);
        }
      } catch {}
    }
  }, []);

  // Handler for resume button
  const handleResume = () => {
    if (resumeState) {
      // Store resume info in ref to restore after chapters load
      pendingResumeRef.current = {
        selectedChapterIdx: resumeState.selectedChapterIdx ?? 0,
        currentWordIdx: resumeState.currentWordIdx ?? 0,
        showChapters: resumeState.showChapters ?? true,
      };
      setFileName(resumeState.fileName);
      setShowResumePrompt(false);
      // Prompt user to re-import the file
      setTimeout(() => {
        if (fileInputRef.current) fileInputRef.current.click();
      }, 200);
    }
  };

  // After chapters are loaded, if pendingResumeRef is set, restore chapter/word
  useEffect(() => {
    if (
      pendingResumeRef.current &&
      chapters.length > 0 &&
      typeof pendingResumeRef.current.selectedChapterIdx === 'number' &&
      chapters[pendingResumeRef.current.selectedChapterIdx]
    ) {
      setSelectedChapterIdx(pendingResumeRef.current.selectedChapterIdx);
      setChapterWords(
        chapters[pendingResumeRef.current.selectedChapterIdx].text.split(/\s+/)
      );
      setCurrentWordIdx(pendingResumeRef.current.currentWordIdx);
      setShowChapters(pendingResumeRef.current.showChapters);
      pendingResumeRef.current = null;
    }
  }, [chapters]);

  return (
    <Container
      maxWidth={false}
      disableGutters
      sx={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        overflow: !fileName ? 'hidden' : 'visible',
        p: 0,
        m: 0,
      }}
    >
      {/* Chapters sidebar - positioned independently */}
      {fileName && showChapters && (
        <Box sx={{ 
          position: 'fixed',
          left: 32,
          top: 0,
          width: 240, 
          minWidth: 200, 
          bgcolor: '#f5f5f5', 
          borderRadius: 2, 
          p: 2, 
          height: '90vh', 
          overflow: 'auto', 
          zIndex: 2, 
          boxShadow: 2,
          mt: 6 
        }}>
          <Button size="small"
            sx={{
              position: 'absolute', top: 8, right: 8, minWidth: 0, p: 0.5,
              background: '#1976d2', color: '#fff', borderRadius: '50%',
              width: 32, height: 32, fontWeight: 'bold', fontSize: 18,
              boxShadow: 2,
              '&:hover': { background: '#1565c0' }
            }}
            onClick={() => setShowChapters(false)}
            title="Hide chapters"
          >&lt;</Button>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mb: 3, mt: 5 }}>
            <Typography variant="h6">Chapters</Typography>
            <Box sx={{ display: 'flex', justifyContent: 'center', width: '100%' }}>
              <input
                ref={fileInputRef}
                type="file"
                accept=".epub,.pdf,.txt"
                style={{ display: 'none' }}
                onChange={handleFileChange}
              />
              <Button 
                variant="text" 
                size="small" 
                onClick={handleImportClick}
                sx={{
                  color: 'text.secondary',
                  fontSize: '0.875rem',
                  textTransform: 'none',
                  '&:hover': { 
                    background: 'rgba(0, 0, 0, 0.04)',
                    color: 'text.primary'
                  }
                }}
              >New File</Button>
            </Box>
          </Box>
          {chapters.length === 0 && <Typography variant="body2" color="text.secondary">No chapters loaded</Typography>}
          {chapters.map((ch, idx) => (
            <Button key={idx} fullWidth variant={selectedChapterIdx === idx ? 'contained' : 'outlined'} sx={{ mb: 1, textAlign: 'left', zIndex: 2 }} onClick={() => handleSelectChapter(idx)}>
              {ch.title}
            </Button>
          ))}
        </Box>
      )}
      {fileName && !showChapters && (
        <Box sx={{ 
          position: 'fixed',
          left: 32,
          top: 24,
          width: 32, 
          minWidth: 32,
          display: 'flex', 
          alignItems: 'flex-start', 
          justifyContent: 'center', 
          zIndex: 2
        }}>
          <Button size="small"
            sx={{
              minWidth: 0, p: 0.5,
              background: '#1976d2', color: '#fff', borderRadius: '50%',
              width: 32, height: 32, fontWeight: 'bold', fontSize: 18,
              boxShadow: 2,
              '&:hover': { background: '#1565c0' }
            }}
            onClick={() => setShowChapters(true)}
            title="Show chapters"
          >&gt;</Button>
        </Box>
      )}
      <Box
        sx={{
          position: 'fixed',
          left: '50%',
          transform: 'translateX(-50%)',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1,
          height: '100%',
          overflow: fileName ? 'auto' : 'hidden',
          p: 0,
          m: 0,
          width: '1200px',
        }}
      >
        {/* Import New File button is now part of the chapters sidebar */}
        
        {/* Resume prompt */}
        {!fileName && showResumePrompt && resumeState && (
          <Paper elevation={3} sx={{ width: '100%', maxWidth: 900, p: 2, position: 'relative', textAlign: 'center', background: '#e3f2fd' }}>
            <Typography variant="h5" color="primary" gutterBottom>
              Continue where you left off?
            </Typography>
            <Typography variant="body1" sx={{ mb: 2 }}>
              Last file: <b>{resumeState.fileName}</b><br/>
              Chapter: <b>{typeof resumeState.selectedChapterIdx === 'number' ? resumeState.selectedChapterIdx + 1 : 1}</b>
            </Typography>
            <Box sx={{ display: 'flex', gap: 2, justifyContent: 'center' }}>
              <Button variant="contained" color="primary" onClick={handleResume}>Resume Reading</Button>
              <Button variant="outlined" color="secondary" onClick={() => setShowResumePrompt(false)}>Dismiss</Button>
            </Box>
          </Paper>
        )}
        
        {/* Import UI, only before import */}
        {!fileName ? (
          <Paper elevation={3} sx={{ width: '100%', maxWidth: 900, p: 3, position: 'relative', mt: showResumePrompt ? 2 : 0 }}>
            <Typography variant="h4" align="center" gutterBottom>
              SpeedReader
            </Typography>
            <Typography variant="body1" align="center" gutterBottom>
              Import your text (EPUB, PDF, or TXT) and start speed reading!
            </Typography>
            <Box display="flex" flexDirection="column" alignItems="center" gap={2}>
              <input
                ref={fileInputRef}
                type="file"
                accept=".epub,.pdf,.txt"
                style={{ display: 'none' }}
                onChange={handleFileChange}
              />
              <Button variant="contained" onClick={handleImportClick} size="large">
                Import File
              </Button>
              {error && (
                <Typography variant="subtitle2" color="error">
                  {error}
                </Typography>
              )}
            </Box>
          </Paper>
        ) : null}
        
        {/* Speed reading controls and preview for selected chapter */}
        {selectedChapterIdx !== null && chapters[selectedChapterIdx] && (
          <Paper elevation={2} sx={{ 
            mt: 8, 
            p: 4, 
            width: '100%', 
            maxWidth: 1000, 
            minHeight: 420,
            display: 'flex', 
            flexDirection: 'column', 
            alignItems: 'center', 
            background: '#181c24', 
            color: '#fff', 
            borderRadius: 3, 
            position: 'relative', 
            overflow: 'visible' 
          }}>
            {/* Overlay dictionary definition if open */}
            {showDictionary && (
              <Box
                sx={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  width: '100%',
                  height: '100%',
                  bgcolor: 'rgba(34, 34, 34, 0.98)',
                  zIndex: 10,
                  borderRadius: 3,
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  p: 4,
                }}
              >
                <Typography variant="subtitle1" color="primary" gutterBottom>Definition for: {selectedWord}</Typography>
                <Typography variant="body1" color="#fff" sx={{ whiteSpace: 'pre-line', mb: 2, textAlign: 'center' }}>
                  {dictionaryDefinition || 'Loading...'}
                </Typography>
                <Button variant="contained" color="error" onClick={() => setShowDictionary(false)} sx={{ mt: 2 }}>Close</Button>
              </Box>
            )}
            {/* Hide the rest of the box when dictionary is open */}
            {!showDictionary && (
              <>
                <Typography variant="h6" align="center" gutterBottom sx={{ color: '#90caf9', fontSize: '1.5rem' }}>{chapters[selectedChapterIdx].title}</Typography>
                <Box
                  sx={{
                    fontSize: { xs: 64, sm: 82, md: 96 },
                    fontWeight: 'bold',
                    minHeight: 180,
                    minWidth: 580,
                    mb: 3,
                    letterSpacing: 2,
                    color: '#fff',
                    background: '#181c24',
                    borderRadius: 2,
                    px: 8,
                    py: 4,
                    boxShadow: 4,
                    textAlign: 'center',
                    transition: 'background 0.3s',
                    userSelect: 'none',
                    textShadow: '0 2px 8px #000, 0 0px 1px #1976d2',
                    outline: 'none',
                    border: 'none',
                    display: 'inline-block',
                    width: 'auto',
                    maxWidth: '100%',
                    overflowWrap: 'break-word',
                    wordBreak: 'break-word',
                    backgroundClip: 'padding-box',
                  }}
                  tabIndex={0}
                >
                  {chapterWords[currentWordIdx] || ''}
                </Box>
                <Box display="flex" gap={2}>
                  <Button variant="contained" color="primary" onClick={handlePlay} disabled={isPlaying || chapterWords.length === 0}>Play</Button>
                  <Button variant="contained" color="secondary" onClick={handlePause} disabled={!isPlaying}>Pause</Button>
                  <Button variant="outlined" onClick={handleReset} disabled={chapterWords.length === 0}>Reset</Button>
                  <Button variant="outlined" onClick={handleDictionaryLookup} disabled={chapterWords.length === 0} sx={{ ml: 2 }}>Define</Button>
                </Box>
                <Typography variant="caption" color="text.secondary" sx={{ mt: 1 }}>
                  Word {currentWordIdx + 1} / {chapterWords.length}
                </Typography>
              </>
            )}
            {/* Scrollable preview with clickable words */}
            <Paper elevation={1} sx={{ 
              mt: 3, 
              p: 4, 
              width: '100%', 
              maxWidth: 900, 
              maxHeight: 280, 
              minHeight: 120, 
              overflowY: 'auto', 
              overflowX: 'hidden', 
              background: '#fafafa', 
              cursor: 'pointer', 
              boxSizing: 'border-box', 
              position: 'relative' 
            }} ref={previewBoxRef}>
              <Typography variant="subtitle2" color="text.secondary" gutterBottom>Preview (click a word to start there)</Typography>
              <Box sx={{ userSelect: 'text', wordBreak: 'break-word', lineHeight: 2 }}>
                {chapterWords.map((w, i) => (
                  <span
                    key={i}
                    data-word-idx={i}
                    style={{
                      background: i === currentWordIdx
                        ? '#ffe082'
                        : (selectedWordIdx === i && i !== currentWordIdx
                            ? '#b3e5fc'
                            : 'inherit'),
                      cursor: 'pointer',
                      borderRadius: 3,
                      padding: '0 2px',
                    }}
                    onClick={() => handleWordClick(i)}
                  >
                    {w} 
                  </span>
                ))}
              </Box>
              {selectedWord && !showDictionary && (
                <Box sx={{ mt: 2, display: 'flex', alignItems: 'center', gap: 2 }}>
                  <Typography variant="body2" color="primary">Selected: <b>{selectedWord}</b></Typography>
                </Box>
              )}
            </Paper>
          </Paper>
        )}
        {loading && (
          <Typography variant="body1" color="info.main" sx={{ mt: 2 }}>
            Loading and parsing file...
          </Typography>
        )}
        <Typography variant="caption" align="center" color="text.secondary" sx={{ mt: 2 }}>
          &copy; {new Date().getFullYear()} SpeedReader
        </Typography>
      </Box>
    </Container>
  );
}

export default App;
