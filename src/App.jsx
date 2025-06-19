import React, { useRef, useState, useEffect, useMemo, useCallback, memo } from 'react';
import { Container, Typography, Box, Button, Paper } from '@mui/material';
import ePub from 'epubjs';
import './App.css';

const WordPreview = memo(({ word, isSelected, isHighlighted, onClick }) => (
  <span
    style={{
      background: isHighlighted ? '#ffe082' : (isSelected ? '#b3e5fc' : 'inherit'),
      cursor: 'pointer',
      borderRadius: 3,
      padding: '0 2px',
    }}
    onClick={onClick}
  >
    {word} 
  </span>
));

function App() {
  const fileInputRef = useRef();
  const previewBoxRef = useRef();
  const pendingResumeRef = useRef(null);
  const [fileName, setFileName] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [chapters, setChapters] = useState([]);
  const [selectedChapterIdx, setSelectedChapterIdx] = useState(null);
  const [chapterWords, setChapterWords] = useState([]);
  const [showChapters, setShowChapters] = useState(true);
  const [selectedWord, setSelectedWord] = useState(null);
  const [selectedWordIdx, setSelectedWordIdx] = useState(null);
  const [showDictionary, setShowDictionary] = useState(false);
  const [dictionaryDefinition, setDictionaryDefinition] = useState('');
  const [showResumePrompt, setShowResumePrompt] = useState(false);
  const [resumeState, setResumeState] = useState(null);
  const [currentWordIdx, setCurrentWordIdx] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [intervalId, setIntervalId] = useState(null);

  // Utility: Clean and preserve paragraphs from HTML (optimized)
  const extractCleanTextFromHTML = useCallback((html) => {
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
  }, []);

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
      } else {
        setChapters(chapterArr);
        setSelectedChapterIdx(0);
        setChapterWords(chapterArr[0].text.split(/\s+/));
        setCurrentWordIdx(0);
        setShowChapters(true); // Show chapters for EPUB files
      }
      setLoading(false);
    } catch (err) {
      clearTimeout(timeoutId);
      setError('Failed to parse EPUB file: ' + (err?.message || err));
      setLoading(false);
    }
  };

  const handleFileChange = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    
    const ext = file.name.split('.').pop().toLowerCase();
    if (ext !== 'epub') {
      setError('Only EPUB files are supported.');
      return;
    }

    setFileName(file.name);
    setError('');
    parseEpub(file);
  };

  const handleImportClick = () => {
    fileInputRef.current.click();
  };

  const handlePlay = useCallback(() => {
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
  }, [chapterWords.length, currentWordIdx, intervalId]);

  const handlePause = useCallback(() => {
    setIsPlaying(false);
    if (intervalId) {
      clearInterval(intervalId);
      setIntervalId(null);
    }
  }, [intervalId]);

  const handleReset = useCallback(() => {
    setCurrentWordIdx(0);
    handlePause();
  }, [handlePause]);

  // Memoize the processed text for the current chapter
  const processedChapterText = useMemo(() => {
    if (chapters.length === 0 || selectedChapterIdx === null) return [];
    return chapters[selectedChapterIdx].text.split(/\s+/);
  }, [chapters, selectedChapterIdx]);

  // When a chapter is selected, update chapterWords and reset speed reading
  const handleSelectChapter = useCallback((idx) => {
    setSelectedChapterIdx(idx);
    setCurrentWordIdx(0);
    setIsPlaying(false);
    if (intervalId) clearInterval(intervalId);
    setIntervalId(null);
  }, [intervalId]);

  // When a word is clicked in the preview, set the speed reading cursor and allow dictionary lookup
  const handleWordClick = useCallback((idx) => {
    setCurrentWordIdx(idx);
    setIsPlaying(false);
    if (intervalId) clearInterval(intervalId);
    setIntervalId(null);
    setSelectedWord(chapterWords[idx]);
    setSelectedWordIdx(idx);
    setShowDictionary(false);
  }, [intervalId, chapterWords]);

  const handleDictionaryLookup = useCallback(async () => {
    if (chapterWords.length > 0 && currentWordIdx >= 0 && currentWordIdx < chapterWords.length) {
      const word = chapterWords[currentWordIdx];
      // Batch state updates
      const updates = (showDict) => {
        setSelectedWord(word);
        setSelectedWordIdx(currentWordIdx);
        setShowDictionary(showDict);
        setDictionaryDefinition('');
      };
      updates(true);
      
      try {
        const response = await fetch(`https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(word)}`);
        const data = await response.json();
        const definition = data[0]?.meanings?.[0]?.definitions?.[0]?.definition || 'No definition found.';
        setDictionaryDefinition(definition);
      } catch (e) {
        setDictionaryDefinition('Error fetching definition.');
      }
    }
  }, [chapterWords, currentWordIdx]);

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

  // Update chapter words when processed text changes
  useEffect(() => {
    setChapterWords(processedChapterText);
  }, [processedChapterText]);

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

  // Memoize the word preview components
  const memoizedWordPreviews = useMemo(() => 
    chapterWords.map((w, i) => (
      <WordPreview
        key={i}
        word={w}
        isSelected={i === currentWordIdx}
        isHighlighted={selectedWordIdx === i && i !== currentWordIdx}
        onClick={() => handleWordClick(i)}
      />
    )), 
    [chapterWords, currentWordIdx, selectedWordIdx, handleWordClick]
  );

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
      {/* Chapters sidebar */}
      {fileName && showChapters && (
        <Box sx={{ 
          position: 'fixed',
          left: 32,
          top: 24,
          width: 240, 
          minWidth: 200, 
          bgcolor: '#f5f5f5', 
          borderRadius: 2, 
          p: 2, 
          height: '90vh', 
          overflow: 'auto', 
          zIndex: 2, 
          boxShadow: 2,
          paddingRight: 4 // Add extra padding on the right
        }}>
          <Button size="small"
            sx={{
              position: 'absolute',
              top: 16,
              left: 8,
              minWidth: 0,
              p: 0.5,
              background: '#1976d2',
              color: '#fff',
              borderRadius: '50%',
                width: 32,
                height: 32,
                fontWeight: 'bold',
                fontSize: 18,
                boxShadow: 2,
                '&:hover': { background: '#1565c0' }
              }}
            onClick={() => setShowChapters(false)}
            title="Hide chapters"
          >-</Button>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mb: 3, mt: 5 }}>
            <Typography variant="h6">Chapters</Typography>
            <Box sx={{ display: 'flex', justifyContent: 'center', width: '100%' }}>
              <input
                ref={fileInputRef}
                type="file"
                accept=".epub"
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
              >New Book</Button>
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
          left: 40,
          top: 40,
          width: 32, 
          minWidth: 32,
          height: 32,
          display: 'flex', 
          alignItems: 'center', 
          justifyContent: 'center', 
          zIndex: 2
        }}>
          <Button size="small"
            sx={{
              position: 'absolute',
              minWidth: 0, p: 0.5,
              background: '#1976d2', color: '#fff', borderRadius: '50%',
              width: 32, height: 32, fontWeight: 'bold', fontSize: 18,
              boxShadow: 2,
              '&:hover': { background: '#1565c0' }
            }}
            onClick={() => setShowChapters(true)}
            title="Show chapters"
          >+</Button>
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
        {/* Import UI and resume prompt */}
        {!fileName ? (
          <>
            <Paper elevation={3} sx={{ width: '100%', maxWidth: 900, p: 3, position: 'relative' }}>
              <Typography variant="h4" align="center" gutterBottom>
                SpeedReader
              </Typography>
              <Typography variant="body1" align="center" gutterBottom>
                Import your EPUB book and start speed reading!
              </Typography>
              <Box display="flex" flexDirection="column" alignItems="center" gap={2}>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".epub"
                  style={{ display: 'none' }}
                  onChange={handleFileChange}
                />
                <Button variant="contained" onClick={handleImportClick} size="large">
                  Import Book
                </Button>
                {error && (
                  <Typography variant="subtitle2" color="error">
                    {error}
                  </Typography>
                )}
              </Box>
            </Paper>
            
            {/* Resume prompt - positioned below without affecting main layout */}
            <Box sx={{ height: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', mt: 3 }}>
              {showResumePrompt && resumeState && (
                <Paper 
                  elevation={2} 
                  sx={{ 
                    width: '100%', 
                    maxWidth: 700, 
                    p: 2,
                    position: 'relative', 
                    textAlign: 'left', 
                    background: '#f5f5f5',
                    borderLeft: '4px solid #1976d2',
                    borderRadius: 1,
                    opacity: 0.9,
                    transition: 'opacity 0.2s',
                    '&:hover': {
                      opacity: 1
                    }
                  }}
                >
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <Box>
                      <Typography variant="body1" color="primary.main" sx={{ fontWeight: 500 }}>
                        Continue reading: <span style={{ color: '#333' }}>{resumeState.fileName}</span>
                      </Typography>
                      <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                        Chapter {typeof resumeState.selectedChapterIdx === 'number' ? resumeState.selectedChapterIdx + 1 : 1}
                      </Typography>
                    </Box>
                    <Box sx={{ display: 'flex', gap: 1 }}>
                      <Button size="small" variant="contained" color="primary" onClick={handleResume}>Resume</Button>
                      <Button size="small" variant="text" color="inherit" onClick={() => setShowResumePrompt(false)}>Dismiss</Button>
                    </Box>
                  </Box>
                </Paper>
              )}
            </Box>
          </>
        ) : null}
        
        {/* Speed reading controls and preview */}
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
                <Typography variant="h6" align="center" gutterBottom sx={{ color: '#90caf9', fontSize: '1.5rem' }}>
                  {chapters[selectedChapterIdx]?.title || fileName}
                </Typography>
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
                {memoizedWordPreviews}
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
            Loading and parsing book...
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
