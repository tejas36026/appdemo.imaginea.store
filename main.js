document.addEventListener('DOMContentLoaded', () => {
    // --- Constants ---
    const THEME_STORAGE_KEY = 'studentTrackerTheme';
    const DEFAULT_THEME = 'authenticheck-dark'; // New default theme
    const TRACKING_DATA_KEY = 'studentTrackingDataAll';
    const WORD_AVG_LENGTH = 5;
    const TYPING_PAUSE_THRESHOLD_MS = 1500;
    const DEBOUNCE_ANALYZE_MS = 300;
    const SESSION_SAVE_INTERVAL_MS = 30000;
    const jsEditor = document.getElementById('jsEditor');
    const highlightedOutputContainer = document.getElementById('highlighted-output-container');
    const analysisButton = document.getElementById('analysisButton');

    const themeAuthentiCheckDarkBtn = document.getElementById('themeAuthentiCheckDarkBtn'); // New theme button
    const themeLightBtn = document.getElementById('themeLightBtn');
    const themeDarkBtn = document.getElementById('themeDarkBtn');
    const themeBlueNeonBtn = document.getElementById('themeBlueNeonBtn');
    const statSessionTimeEl = document.getElementById('statSessionTime');
    const statTypedCharsEl = document.getElementById('statTypedChars');
    const statPastedCharsEl = document.getElementById('statPastedChars');
    const statAvgSpeedEl = document.getElementById('statAvgSpeed');
    const statBackspacesEl = document.getElementById('statBackspaces');
    const statDeletesEl = document.getElementById('statDeletes');
    const statPasteCountEl = document.getElementById('statPasteCount');
    const dashboardModalOverlay = document.getElementById('dashboardModalOverlay');
    const closeDashboardModalBtn = document.getElementById('closeDashboardModalBtn');
    const dashboardFrame = document.getElementById('dashboardFrame');

    const hamburgerMenu = document.getElementById('hamburgerMenu');
    const hamburgerBtn = document.getElementById('hamburger-btn');
    const hamburgerContent = document.getElementById('hamburger-content');
    const clearDataButton = document.getElementById('clearDataButton'); // <-- ADD THIS
    const printReportBtn = document.getElementById('printReportBtn');
    const vizBarTyped = document.getElementById('vizBarTyped');
    const vizBarPasted = document.getElementById('vizBarPasted');
    const printDashboardButton = document.getElementById('printDashboardButton');
    const vizTypedBar = document.getElementById('vizTypedBar');
    const vizPastedBar = document.getElementById('vizPastedBar');
    const numericTyped = document.getElementById('numericTyped');
    const numericPasted = document.getElementById('numericPasted');


    function clearAllData() {
        const confirmation = confirm(
            "Are you sure you want to delete ALL tracked data and settings? This action cannot be undone."
        );

        if (confirmation) {
            // Clear the specific keys used by the application
            localStorage.removeItem(TRACKING_DATA_KEY);
            localStorage.removeItem(THEME_STORAGE_KEY);

            // Inform the user and reload the page to apply the changes
            alert("All data has been cleared. The application will now reload.");
            window.location.reload();
        }
    }

    function updatePrintButtonViz() {
        if (!vizTypedBar || !vizPastedBar || !numericTyped || !numericPasted) return;
        
        const totalChars = typedChars + pastedChars;
        
        // Update numeric representation
        numericTyped.textContent = typedChars;
        numericPasted.textContent = pastedChars;
        
        if (totalChars === 0) {
            vizTypedBar.style.width = '0%';
            vizPastedBar.style.width = '0%';
            return;
        }
        
        const typedPercent = (typedChars / totalChars) * 100;
        const pastedPercent = (pastedChars / totalChars) * 100;
        
        vizTypedBar.style.width = `${typedPercent}%`;
        vizPastedBar.style.width = `${pastedPercent}%`;
    }


    function updateReportButtonViz() {
        if (!vizBarTyped || !vizBarPasted) return;
        
        const totalChars = typedChars + pastedChars;
        if (totalChars === 0) {
            vizBarTyped.style.width = '0%';
            vizBarPasted.style.width = '0%';
            return;
        }
        
        const typedPercent = (typedChars / totalChars) * 100;
        const pastedPercent = (pastedChars / totalChars) * 100;
        
        vizBarTyped.style.width = `${typedPercent}%`;
        vizBarPasted.style.width = `${pastedPercent}%`;
    }

    let sessionStartTime = null;
    let lastActivityTime = null;
    let totalActiveTimeMs = 0;
    let sessionTimerInterval = null;
    let autoSaveInterval = null;
    let typedChars = 0;
    let pastedChars = 0;
    let backspaceCount = 0;
    let deleteCount = 0;
    let pasteCount = 0;
    let undoCount = 0;
    let currentFullText = "";
    let textCharAttributes = [];
    let typingEvents = [];
    let sentenceStats = [];

    let isPasting = false;
    let lastInputTimestamp = 0;
    let lastEventTimestamp = 0;
    let pasteIdentifier = null;
    let lastPastedTextForInputEvent = "";

    let sentenceTextBuffer = "";
    let sentenceCharAttributesBuffer = [];
    let sentenceStartTime = 0;
    let sentenceTypedDurationMs = 0;
    let sentenceBackspaces = 0;
    let sentenceDeletes = 0;
    let sentenceUndos = 0;
    let currentSentenceContainedPaste = false;
    let currentSentenceHasBeenCorrected = false;

    let currentWordBuffer = "";
    let currentWordStartTime = 0;
    let wordsInCurrentSentence = 0;

    let averageWPM = 0;
    let wpmValuesForAvg = [];
    let debounceRenderTimeout;

    function init() {
        loadTheme();
        attachEventListeners();
        startSession();
        jsEditor.focus();
        jsEditor.style.opacity = '1'; // Make editor visible after setup
        updatePrintButtonViz(); // <-- ADD THIS LINE

    }

    function startSession() {
        sessionStartTime = Date.now();
        lastActivityTime = Date.now();
        lastEventTimestamp = Date.now();
        totalActiveTimeMs = 0; typedChars = 0; pastedChars = 0;
        backspaceCount = 0; deleteCount = 0; pasteCount = 0; undoCount = 0;
        averageWPM = 0; wpmValuesForAvg = [];
        printDashboardButton.disabled = true; // <-- ADD THIS LINE

        currentFullText = jsEditor.value;
        textCharAttributes = currentFullText.split('').map(char => {
            typedChars++; // Initial content counted as typed
            return { char, origin: 'typed', pasteId: null };
        });

        typingEvents = []; sentenceStats = [];
        isPasting = false; pasteIdentifier = null; lastPastedTextForInputEvent = "";
        
        resetCurrentSentenceState();
        sentenceTextBuffer = currentFullText;
        sentenceCharAttributesBuffer = [...textCharAttributes];
        currentSentenceContainedPaste = sentenceCharAttributesBuffer.some(attr => attr.origin === 'pasted');

        updateStatsDisplay();
        renderAllFinalizedSentences(); // Initial render based on any pre-filled text

        clearInterval(sessionTimerInterval);
        sessionTimerInterval = setInterval(updateSessionTime, 1000);
        clearInterval(autoSaveInterval);
        autoSaveInterval = setInterval(() => {
            if (document.hasFocus() && totalActiveTimeMs > 0) {
                saveCurrentSessionData(false);
            }
        }, SESSION_SAVE_INTERVAL_MS);
    }

    function resetCurrentSentenceState(timestamp = Date.now()) {
        sentenceTextBuffer = ""; sentenceCharAttributesBuffer = [];
        sentenceStartTime = timestamp; sentenceTypedDurationMs = 0;
        sentenceBackspaces = 0; sentenceDeletes = 0; sentenceUndos = 0;
        currentSentenceContainedPaste = false; currentSentenceHasBeenCorrected = false;
        currentWordBuffer = ""; currentWordStartTime = 0; wordsInCurrentSentence = 0;
    }

    function updateSessionTime() {
        if (document.hasFocus() && !isPasting) {
            const now = Date.now();
            if (lastActivityTime <= now) totalActiveTimeMs += now - lastActivityTime;
            lastActivityTime = now;
        } else if (document.hasFocus() && isPasting) {
            lastActivityTime = Date.now();
        }
        statSessionTimeEl.textContent = formatTime(totalActiveTimeMs);
    }

    function recordTypingEvent(type, data = {}) {
        const now = Date.now();
        const durationSinceLast = now - lastEventTimestamp;
        const effectiveDurationSinceLast = (durationSinceLast > TYPING_PAUSE_THRESHOLD_MS && type !== 'pause') ? TYPING_PAUSE_THRESHOLD_MS + 1 : durationSinceLast;

        typingEvents.push({ type, timestamp: now, durationSinceLastEventMs: effectiveDurationSinceLast, ...data });
        lastEventTimestamp = now;

        if (type !== 'pause' && effectiveDurationSinceLast > TYPING_PAUSE_THRESHOLD_MS) {
            typingEvents.push({ type: 'pause', timestamp: now - effectiveDurationSinceLast, durationMs: effectiveDurationSinceLast - (data.durationMs || 0) });
        }
    }

    function handleEditorInput(event) {
        const now = Date.now();
        const newFullText = jsEditor.value;
        const inputType = event.inputType;
        const timeDiff = now - lastInputTimestamp;
        lastInputTimestamp = now; lastActivityTime = now;
   
        let wasThisInputAPaste = (isPasting && (insertedTextFromDiff(currentFullText, newFullText) === lastPastedTextForInputEvent || (inputType && (inputType.includes('paste') || inputType.includes('drop')))));
        
        let textProcessedForPasteEvent = "";
        if (wasThisInputAPaste) {
            if (jsEditor.dataset.pastedTextContent && jsEditor.dataset.pasteEventId === String(pasteIdentifier)) {
                textProcessedForPasteEvent = jsEditor.dataset.pastedTextContent;
                delete jsEditor.dataset.pastedTextContent; delete jsEditor.dataset.pasteEventId;
            } else {
                textProcessedForPasteEvent = insertedTextFromDiff(currentFullText, newFullText);
            }
        }
        
        let diffStart = 0;
        while (diffStart < currentFullText.length && diffStart < newFullText.length && currentFullText[diffStart] === newFullText[diffStart]) diffStart++;
        let diffEndOld = currentFullText.length, diffEndNew = newFullText.length;
        while (diffEndOld > diffStart && diffEndNew > diffStart && currentFullText[diffEndOld - 1] === newFullText[diffEndNew - 1]) { diffEndOld--; diffEndNew--; }
        if (newFullText.length > 0 && printDashboardButton.disabled) {
            printDashboardButton.disabled = false;
        }

        const numRemoved = diffEndOld - diffStart;
        const textInserted = newFullText.substring(diffStart, diffEndNew);
        
        textCharAttributes.slice(diffStart, diffStart + numRemoved).forEach(attr => attr.origin === 'pasted' ? pastedChars-- : typedChars--);
        pastedChars = Math.max(0, pastedChars); typedChars = Math.max(0, typedChars);

        let newCharAttrs = [];
        if (textInserted.length > 0) {
            if (wasThisInputAPaste) {
                const currentPasteOpId = pasteIdentifier;
                const textToAttribute = textProcessedForPasteEvent.length === textInserted.length ? textProcessedForPasteEvent : textInserted;
                newCharAttrs = textToAttribute.split('').map(char => ({ char, origin: 'pasted', pasteId: currentPasteOpId }));
                pastedChars += textToAttribute.length; pasteCount++;
                recordTypingEvent('paste', { text: textToAttribute, charCount: textToAttribute.length, eventId: currentPasteOpId });
            } else {
                newCharAttrs = textInserted.split('').map(char => ({ char, origin: 'typed', pasteId: null }));
                typedChars += textInserted.length;
                if (textInserted.length === 1 && !event.isComposing) {
                    recordTypingEvent('char', { char: textInserted, durationMs: timeDiff });
                    if (!currentSentenceContainedPaste && !currentSentenceHasBeenCorrected) sentenceTypedDurationMs += timeDiff;
                    currentWordBuffer += textInserted;
                    if (!currentWordStartTime && currentWordBuffer.trim().length > 0) currentWordStartTime = now - timeDiff;
                    if (textInserted.match(/\s|[.!?\n]/)) { // Added \n to trigger word/sentence processing
                        if (currentWordBuffer.trim().length > 0) processTypedWord(now);
                        if (textInserted.match(/[.!?\n]$/)) finalizeCurrentSentence(now);
                    }
                } else if (textInserted.length > 1) {
                    recordTypingEvent('chars_block', { text: textInserted, durationMs: timeDiff });
                    if (!currentSentenceContainedPaste && !currentSentenceHasBeenCorrected) sentenceTypedDurationMs += timeDiff; // Approximate
                    if (textInserted.match(/[.!?\n]$/)) finalizeCurrentSentence(now);
                }
            }
        }
        
        textCharAttributes.splice(diffStart, numRemoved, ...newCharAttrs);
        currentFullText = newFullText;
    
        if (wasThisInputAPaste || isPasting) {
            setTimeout(() => { isPasting = false; lastPastedTextForInputEvent = ""; pasteIdentifier = null; }, 0);
        }
    
        let finalizedSentencesAggregatedLength = sentenceStats.reduce((acc, s) => acc + s.text.length, 0);
        sentenceTextBuffer = currentFullText.substring(finalizedSentencesAggregatedLength);
        sentenceCharAttributesBuffer = textCharAttributes.slice(finalizedSentencesAggregatedLength);
        currentSentenceContainedPaste = sentenceCharAttributesBuffer.some(attr => attr.origin === 'pasted');
        if (jsEditor.value.length > 0 && printDashboardButton.disabled) {
            printDashboardButton.disabled = false;
        }

        if (numRemoved > 0 && !wasThisInputAPaste) { currentWordBuffer = ""; currentWordStartTime = 0; }
            
        clearTimeout(debounceRenderTimeout);
        debounceRenderTimeout = setTimeout(renderAllFinalizedSentences, DEBOUNCE_ANALYZE_MS);
        updateStatsDisplay();
    }

    function insertedTextFromDiff(oldStr, newStr) {
        let i = 0; while (i < oldStr.length && i < newStr.length && oldStr[i] === newStr[i]) i++;
        let j = 0; while (i + j < oldStr.length && i + j < newStr.length && oldStr[oldStr.length - 1 - j] === newStr[newStr.length - 1 - j]) j++;
        return newStr.substring(i, newStr.length - j);
    }

    function processTypedWord(timestamp) {
        if (currentWordBuffer.trim().length === 0) return;
        const wordText = currentWordBuffer.trim();
        const wordDurationMs = timestamp - currentWordStartTime;
        const wordChars = wordText.length;
        let wordWpm = 0;
        if (wordDurationMs > 50 && wordChars > 0) wordWpm = Math.round((wordChars / WORD_AVG_LENGTH) / (wordDurationMs / 60000));
        if (wordWpm > 0 && !currentSentenceContainedPaste && !currentSentenceHasBeenCorrected) {
            wpmValuesForAvg.push(wordWpm);
            averageWPM = wpmValuesForAvg.reduce((a, b) => a + b, 0) / wpmValuesForAvg.length;
        }
        wordsInCurrentSentence++; currentWordBuffer = ""; currentWordStartTime = 0;
    }
    
    function generateSubSegments(textForSeg, charAttrsForSeg) {
        const segments = []; if (!textForSeg || textForSeg.length === 0) return segments;
        if (!charAttrsForSeg || charAttrsForSeg.length !== textForSeg.length) {
            segments.push({ text: textForSeg, type: 'typed' }); return segments;
        }
        let currentSegText = "", currentSegType = charAttrsForSeg[0].origin;
        for (let i = 0; i < textForSeg.length; i++) {
            const attr = charAttrsForSeg[i];
            if (attr.origin === currentSegType) currentSegText += textForSeg[i];
            else {
                if (currentSegText.length > 0) segments.push({ text: currentSegText, type: currentSegType });
                currentSegType = attr.origin; currentSegText = textForSeg[i];
            }
        }
        if (currentSegText.length > 0) segments.push({ text: currentSegText, type: currentSegType });
        return segments;
    }
        
    function finalizeCurrentSentence(timestamp) {
        const trimmedSentenceText = sentenceTextBuffer.trim();
        const charAttrsForFinalSentence = [...sentenceCharAttributesBuffer];
        if (trimmedSentenceText.length === 0 && !sentenceTextBuffer.includes('\n')) { // Allow finalizing if only newlines remain
            if (sentenceTextBuffer.length > 0) { // If it was only newlines, push those as a segment
                 sentenceStats.push({ text: sentenceTextBuffer, charAttributes: charAttrsForFinalSentence, subSegments: generateSubSegments(sentenceTextBuffer, charAttrsForFinalSentence), category: 'typed', typedChars: 0, pastedCharsInSentence: 0, typedDurationMs:0, wpm:0, totalCorrections:0 });
            }
            resetCurrentSentenceState(timestamp || Date.now()); return;
        }

        const subSegments = generateSubSegments(sentenceTextBuffer, charAttrsForFinalSentence);
        let actualPastedCharCountInSentence = 0, actualTypedCharCountInSentence = 0;
        subSegments.forEach(seg => seg.type === 'pasted' ? actualPastedCharCountInSentence += seg.text.length : actualTypedCharCountInSentence += seg.text.length);
        
        let category = actualPastedCharCountInSentence > 0 ? (actualTypedCharCountInSentence > 0 ? 'mixed-paste-typed' : 'pasted') : (currentSentenceHasBeenCorrected ? 'corrected' : 'typed');
        const finalSentenceWPM = (actualTypedCharCountInSentence > 0 && sentenceTypedDurationMs > 0) ? Math.round((actualTypedCharCountInSentence / WORD_AVG_LENGTH) / (sentenceTypedDurationMs / 60000)) : 0;
        const totalCorrections = sentenceBackspaces + sentenceDeletes + sentenceUndos;

        sentenceStats.push({
            text: sentenceTextBuffer, charAttributes: charAttrsForFinalSentence, startTime: sentenceStartTime, endTime: timestamp,
            typedDurationMs: sentenceTypedDurationMs, typedChars: actualTypedCharCountInSentence, pastedCharsInSentence: actualPastedCharCountInSentence,
            typedWords: wordsInCurrentSentence, wpm: finalSentenceWPM, backspaces: sentenceBackspaces, deletes: sentenceDeletes,
            undos: sentenceUndos, totalCorrections: totalCorrections, category: category, subSegments: subSegments,
        });
        resetCurrentSentenceState(timestamp || Date.now());
    }

    function handleEditorKeyDown(event) {
        lastActivityTime = Date.now();
        if (event.key === 'Backspace') { backspaceCount++; sentenceBackspaces++; currentSentenceHasBeenCorrected = true; recordTypingEvent('backspace'); }
        else if (event.key === 'Delete') { deleteCount++; sentenceDeletes++; currentSentenceHasBeenCorrected = true; recordTypingEvent('delete'); }
        else if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z') { undoCount++; sentenceUndos++; currentSentenceHasBeenCorrected = true; recordTypingEvent('undo'); }
        else if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'v') { isPasting = true; if (!pasteIdentifier) pasteIdentifier = Date.now() + Math.random(); }
        if (event.key === 'Enter') { if (currentWordBuffer.trim().length > 0) processTypedWord(Date.now()); }
    }

    function handleEditorPaste(event) {
        isPasting = true;
        const rawPastedData = event.clipboardData.getData('text/plain');
        lastPastedTextForInputEvent = rawPastedData.replace(/\r\n/g, "\n");
        if (!pasteIdentifier) pasteIdentifier = Date.now() + Math.random();
        if (lastPastedTextForInputEvent) { jsEditor.dataset.pastedTextContent = lastPastedTextForInputEvent; jsEditor.dataset.pasteEventId = String(pasteIdentifier); }
    }

    function handleEditorFocus() { lastActivityTime = Date.now(); if (!sessionStartTime) startSession(); }
    function handleEditorBlur() { const now = Date.now(); if (currentWordBuffer.trim().length > 0) processTypedWord(now); if (sentenceTextBuffer.length > 0) finalizeCurrentSentence(now); updateSessionTime(); }

    function renderAllFinalizedSentences() {
        highlightedOutputContainer.innerHTML = ''; 
        const fragment = document.createDocumentFragment();

        function createSegmentDiv(segmentText, segmentClass, stats) {
            const wrapper = document.createElement('div'); wrapper.className = 'segment-wrapper';
            const textSpan = document.createElement('span'); textSpan.className = 'segment-text-content ' + segmentClass;
            textSpan.innerHTML = segmentText.replace(/\n/g, '<br>'); 
            const tooltip = document.createElement('div'); tooltip.className = 'segment-tooltip';
            let tooltipContent = (stats.type === 'typed' ? `WPM: ${stats.wpm ? stats.wpm.toFixed(0) : 'N/A'}, ` : `WPM: N/A (Pasted), `);
            if (stats.durationMs !== undefined) tooltipContent += `Time: ${formatTime(stats.durationMs || 0)}, `;
            tooltipContent += `Chars: ${stats.charCount || 0}`;
            if (stats.edits > 0 && stats.type === 'typed') tooltipContent += `, Edits: ${stats.edits}`;
            tooltip.textContent = tooltipContent;
            wrapper.appendChild(tooltip); wrapper.appendChild(textSpan); return wrapper;
        }

        sentenceStats.forEach(sStat => {
            sStat.subSegments.forEach(subSeg => {
                if (subSeg.text.trim().length === 0 && !subSeg.text.includes('\n')) return;
                let subSegClass = subSeg.type === 'pasted' ? 'highlight-red-pasted' : (sStat.totalCorrections > 0 ? 'highlight-green-corrected' : 'highlight-yellow-typed');
                let statsForSubSegTooltip = { type: subSeg.type, category: sStat.category, charCount: subSeg.text.length, durationMs: 0, wpm: null, edits: 0 };
                if (subSeg.type === 'typed') {
                    statsForSubSegTooltip.wpm = sStat.wpm;
                    if (sStat.typedChars > 0 && sStat.typedDurationMs > 0) statsForSubSegTooltip.durationMs = (subSeg.text.length / sStat.typedChars) * sStat.typedDurationMs;
                    statsForSubSegTooltip.edits = sStat.totalCorrections;
                } else statsForSubSegTooltip.durationMs = 50; // Nominal for pasted
                fragment.appendChild(createSegmentDiv(subSeg.text, subSegClass, statsForSubSegTooltip));
            });
        });

        if (sentenceTextBuffer.length > 0) {
             generateSubSegments(sentenceTextBuffer, sentenceCharAttributesBuffer).forEach(subSeg => {
                if (subSeg.text.trim().length === 0 && !subSeg.text.includes('\n')) return;
                let liveSubSegClass = subSeg.type === 'pasted' ? 'highlight-red-pasted' : (currentSentenceHasBeenCorrected ? 'highlight-green-corrected' : 'highlight-yellow-typed');
                let liveSubSegStats = {
                     type: subSeg.type, category: currentSentenceContainedPaste ? 'mixed-paste-typed' : (currentSentenceHasBeenCorrected ? 'corrected' : 'typed'),
                     charCount: subSeg.text.length, durationMs: (Date.now() - sentenceStartTime) * (subSeg.text.length / (sentenceTextBuffer.length || 1)),
                     wpm: (subSeg.type === 'typed' && averageWPM > 0) ? averageWPM : null, edits: (subSeg.type === 'typed') ? (sentenceBackspaces + sentenceDeletes + sentenceUndos) : 0,
                };
                fragment.appendChild(createSegmentDiv(subSeg.text, liveSubSegClass, liveSubSegStats));
             });
        }
        highlightedOutputContainer.appendChild(fragment);
        if (highlightedOutputContainer.firstChild) { // Ensure there's content before trying to scroll
             highlightedOutputContainer.scrollTop = highlightedOutputContainer.scrollHeight;
        }
    }


    if (hamburgerBtn && hamburgerContent) {
        // Toggle the menu when the hamburger button is clicked
        hamburgerBtn.addEventListener('click', (event) => {
            event.stopPropagation(); // Prevent the window click listener from closing it immediately
            hamburgerContent.classList.toggle('show');
        });
    
        // Close the menu if a button inside it is clicked
        hamburgerContent.addEventListener('click', () => {
            hamburgerContent.classList.remove('show');
        });
    
        // Close the menu if the user clicks anywhere else on the page
        window.addEventListener('click', (event) => {
            if (hamburgerContent.classList.contains('show') && !hamburgerMenu.contains(event.target)) {
                hamburgerContent.classList.remove('show');
            }
        });
    }
    
    function updateStatsDisplay() {
        statTypedCharsEl.textContent = typedChars; statPastedCharsEl.textContent = pastedChars;
        statAvgSpeedEl.textContent = `${Math.round(averageWPM)} WPM`;
        statBackspacesEl.textContent = backspaceCount; statDeletesEl.textContent = deleteCount;
        statPasteCountEl.textContent = pasteCount; statSessionTimeEl.textContent = formatTime(totalActiveTimeMs);
   
        updatePrintButtonViz(); // <-- ADD THIS LINE

    }

    function saveCurrentSessionData(isFinal = false) {
        if (!sessionStartTime) return; const now = Date.now();
        if (currentWordBuffer.trim().length > 0) processTypedWord(now);
        if (sentenceTextBuffer.length > 0) finalizeCurrentSentence(now);
        updateSessionTime();

        const sessionData = {
            sessionId: sessionStartTime, startTime: sessionStartTime, endTime: now, totalActiveTimeMs,
            typedChars, pastedChars, backspaceCount, deleteCount, undoCount, pasteCount,
            averageWPM: parseFloat(averageWPM.toFixed(1)), currentFullText: jsEditor.value,
            typingEvents, sentenceStats: sentenceStats.map(s => ({ ...s, charAttributes: undefined })), // Don't save charAttrs here
            pastedSegmentsDetails: typingEvents.filter(e => e.type === 'paste' && e.text).map(e => ({ text: e.text, timestamp: e.timestamp, charCount: e.text.length, wordCount: countWords(e.text) }))
        };
        try {
            let allData = JSON.parse(localStorage.getItem(TRACKING_DATA_KEY) || '[]');
            if (!Array.isArray(allData)) allData = [];
            const existingIdx = allData.findIndex(s => s.sessionId === sessionData.sessionId);
            if (existingIdx > -1) allData[existingIdx] = sessionData; else allData.push(sessionData);
            localStorage.setItem(TRACKING_DATA_KEY, JSON.stringify(allData));
            if (isFinal) { sessionStartTime = null; clearInterval(sessionTimerInterval); clearInterval(autoSaveInterval); sessionTimerInterval = null; autoSaveInterval = null; }
        } catch (e) { console.error("Error saving session data:", e); }
    }
    
    window.addEventListener('beforeunload', () => saveCurrentSessionData(true));

    function openDashboardModal() {
        saveCurrentSessionData(false);
        const currentTheme = localStorage.getItem(THEME_STORAGE_KEY) || DEFAULT_THEME;
        dashboardFrame.src = `dashboard.html#theme=${currentTheme}`;
        dashboardModalOverlay.classList.add('show');

        
        dashboardFrame.onload = () => {
            if (dashboardFrame.contentWindow) {
                dashboardFrame.contentWindow.postMessage({ type: 'SET_THEME', theme: currentTheme }, '*');
            }
        };
    }

    function closeDashboardModal() { 
        dashboardModalOverlay.classList.remove('show'); 
        dashboardFrame.src = 'about:blank'; 

        
    }

    function applyTheme(themeName) {
        document.body.className = ''; // Clear existing theme classes
        document.body.classList.add(`theme-${themeName}`);
        localStorage.setItem(THEME_STORAGE_KEY, themeName);

        // Manage active class on buttons
        [themeAuthentiCheckDarkBtn, themeLightBtn, themeDarkBtn, themeBlueNeonBtn].forEach(btn => btn.classList.remove('active-theme'));
        if (themeName === 'authenticheck-dark') themeAuthentiCheckDarkBtn.classList.add('active-theme');
        else if (themeName === 'light') themeLightBtn.classList.add('active-theme');
        else if (themeName === 'dark') themeDarkBtn.classList.add('active-theme');
        else if (themeName === 'blue-neon') themeBlueNeonBtn.classList.add('active-theme');

        if (dashboardModalOverlay.classList.contains('show') && dashboardFrame.contentWindow) {
            dashboardFrame.contentWindow.postMessage({ type: 'SET_THEME', theme: themeName }, '*');
        }
        renderAllFinalizedSentences(); // Re-render to apply new theme's highlight styles potentially
    }

    function loadTheme() {
        const savedTheme = localStorage.getItem(THEME_STORAGE_KEY) || DEFAULT_THEME;
        applyTheme(savedTheme);
    }

    function printInput() {
        const iframe = document.createElement('iframe');
        iframe.style.cssText = 'height:0;width:0;position:absolute;visibility:hidden;z-index:-1;';
        document.body.appendChild(iframe);
        const printDoc = iframe.contentDocument || iframe.contentWindow.document;
        printDoc.open();
        printDoc.write(`
      
      
      
      
        `);
        printDoc.close();
        iframe.contentWindow.focus(); iframe.contentWindow.print();
        setTimeout(() => document.body.removeChild(iframe), 1000);
    }



    function formatTime(ms) {
        if (isNaN(ms) || ms < 0) return "00:00:00";
        const totalSeconds = Math.floor(ms / 1000);
        const h = String(Math.floor(totalSeconds / 3600)).padStart(2, '0');
        const m = String(Math.floor((totalSeconds % 3600) / 60)).padStart(2, '0');
        const s = String(totalSeconds % 60).padStart(2, '0');
        return `${h}:${m}:${s}`;
    }
    function countWords(str) { return (typeof str !== 'string' || !str.trim()) ? 0 : str.trim().split(/\s+/).filter(Boolean).length; }

    function attachEventListeners() {
        jsEditor.addEventListener('input', handleEditorInput);
        jsEditor.addEventListener('keydown', handleEditorKeyDown);
        jsEditor.addEventListener('paste', handleEditorPaste);
        jsEditor.addEventListener('focus', handleEditorFocus);
        jsEditor.addEventListener('blur', handleEditorBlur);
        analysisButton.addEventListener('click', openDashboardModal);
        closeDashboardModalBtn.addEventListener('click', closeDashboardModal);
   
    //     printDashboardButton.addEventListener('click', () => {

    //         if (printDashboardButton.disabled) {
    //             return; // Do nothing if button is disabled
    //         }
        
    //         // Check if the Android Interface and our simple print function exist
    //         if (window.AndroidInterface && typeof window.AndroidInterface.printPage === 'function') {
    //             // --- This is the ONLY code needed for Android ---
    //             console.log("Calling native Android print function...");
    //             window.AndroidInterface.printPage(); // Just tell Android to handle everything
        
    //         }


    //         else {
    //             console.warn("Not in Android app. Using standard browser print fallback.");

    //         if (printDashboardButton.disabled) return;

    //         const printOverlay = document.getElementById('print-overlay');
            
    //         // Show overlay to inform user and force browser rendering
    //         printOverlay.classList.add('show');

    //         // Set the iframe to be VISIBLE but positioned off-screen.
    //         // This is the key to forcing the browser to render it correctly.
    //         dashboardFrame.style.position = 'fixed';
    //         dashboardFrame.style.left = '-9999px'; // Move it far off-screen
    //         dashboardFrame.style.width = '1200px'; // A standard wide size
    //         dashboardFrame.style.height = '100vh'; // Full viewport height

    //         const handlePrintReady = () => {
    //             // The dashboard content is now fully loaded and rendered.
    //             // We can now safely call the print command on its window.
    //             dashboardFrame.contentWindow.print();

    //             // Clean up immediately after the print dialog is called.
    //             // The browser will handle the rest.
    //             printOverlay.classList.remove('show');
    //             dashboardFrame.style.position = ''; // Reset styles
    //             dashboardFrame.style.left = '';
    //             dashboardFrame.style.width = '';
    //             dashboardFrame.style.height = '';

    //             // If the main modal is closed, clear the iframe.
    //             if (!dashboardModalOverlay.classList.contains('show')) {
    //                 dashboardFrame.src = 'about:blank';
    //             }
                
    //             // Remove the one-time listener.
    //             dashboardFrame.removeEventListener('load', handlePrintReady);
    //         };

    //         // Attach the one-time 'load' listener.
    //         dashboardFrame.addEventListener('load', handlePrintReady);
            
    //         // Save latest data and trigger iframe loading.
    //         saveCurrentSessionData(false);
    //         const currentTheme = localStorage.getItem('studentTrackerTheme') || 'authenticheck-dark';
    //         const targetSrc = new URL('dashboard.html', window.location.href).href + `#theme=${currentTheme}`;
            
    //         if (dashboardFrame.src === targetSrc) {
    //             dashboardFrame.contentWindow.location.reload();
    //         } else {
    //             dashboardFrame.src = targetSrc;
    //         }
      
      
    //   }
    //     });
  

    // printDashboardButton.addEventListener('click', () => {
    //     console.log("Dashboard print button clicked. Sending message to parent.");
    //     // Send a message to the parent window (index.html)
    //     window.parent.postMessage({
    //         type: 'PRINT_DASHBOARD'
    //     }, '*'); 
    // });
    
    printDashboardButton.addEventListener('click', () => {
        if (printDashboardButton.disabled) {
            return; // Do nothing if the button is disabled
        }
    
        // Save latest data first
        saveCurrentSessionData(false);
        
        // --- NATIVE ANDROID PATH ---
        if (window.AndroidInterface && typeof window.AndroidInterface.printPage === 'function') {
            console.log("Native Android interface found. Preparing dashboard HTML for printing.");
            
            const currentTheme = localStorage.getItem('studentTrackerTheme') || 'authenticheck-dark';
            const dashboardIframe = document.getElementById('dashboardFrame');
            
            // Function to send HTML to Android once loaded
            const sendToAndroidPrint = () => {
                if (dashboardIframe && dashboardIframe.contentDocument && dashboardIframe.contentDocument.documentElement) {
                    // Wait a bit for any dynamic content to render
                    setTimeout(() => {
                        const dashboardHtml = dashboardIframe.contentDocument.documentElement.outerHTML;
                        console.log("Sending dashboard HTML to Android print function");
                        window.AndroidInterface.printPage(dashboardHtml);
                    }, 500); // Give it 500ms to ensure all content is rendered
                } else {
                    console.error("Could not access the dashboard iframe content");
                    alert("Error: The dashboard content is not ready for printing.");
                }
            };
    
            // Check if iframe already has the dashboard loaded
            const targetSrc = new URL('dashboard.html', window.location.href).href + `#theme=${currentTheme}`;
            
            if (dashboardIframe.src && dashboardIframe.src.includes('dashboard.html')) {
                // Dashboard is already loaded, just send it
                sendToAndroidPrint();
            } else {
                // Need to load the dashboard first
                dashboardIframe.style.position = 'fixed';
                dashboardIframe.style.left = '-9999px';
                dashboardIframe.style.width = '1200px';
                dashboardIframe.style.height = '100vh';
                
                // Set up one-time load handler
                const handleLoadForAndroid = () => {
                    sendToAndroidPrint();
                    
                    // Clean up
                    dashboardIframe.style.position = '';
                    dashboardIframe.style.left = '';
                    dashboardIframe.style.width = '';
                    dashboardIframe.style.height = '';
                    
                    // Clear iframe if modal is not showing
                    if (!dashboardModalOverlay.classList.contains('show')) {
                        setTimeout(() => {
                            dashboardIframe.src = 'about:blank';
                        }, 1000);
                    }
                    
                    dashboardIframe.removeEventListener('load', handleLoadForAndroid);
                };
                
                dashboardIframe.addEventListener('load', handleLoadForAndroid);
                dashboardIframe.src = targetSrc;
            }
            
        } 
        // --- BROWSER FALLBACK PATH ---
        else {
            console.warn("Not in Android app. Using standard browser print fallback.");
    
            const printOverlay = document.getElementById('print-overlay');
            printOverlay.classList.add('show');
    
            dashboardFrame.style.position = 'fixed';
            dashboardFrame.style.left = '-9999px';
            dashboardFrame.style.width = '1200px';
            dashboardFrame.style.height = '100vh';
    
            const handlePrintReady = () => {
                dashboardFrame.contentWindow.print();
                printOverlay.classList.remove('show');
                dashboardFrame.style.position = '';
                dashboardFrame.style.left = '';
                dashboardFrame.style.width = '';
                dashboardFrame.style.height = '';
    
                if (!dashboardModalOverlay.classList.contains('show')) {
                    dashboardFrame.src = 'about:blank';
                }
                
                dashboardFrame.removeEventListener('load', handlePrintReady);
            };
    
            dashboardFrame.addEventListener('load', handlePrintReady);
            
            const currentTheme = localStorage.getItem('studentTrackerTheme') || 'authenticheck-dark';
            const targetSrc = new URL('dashboard.html', window.location.href).href + `#theme=${currentTheme}`;
            
            if (dashboardFrame.src === targetSrc) {
                dashboardFrame.contentWindow.location.reload();
            } else {
                dashboardFrame.src = targetSrc;
            }
        }
    });
    
    window.addEventListener('message', (event) => {
        // Check if the message is the one we're expecting from the dashboard
        if (event.data && event.data.type === 'PRINT_DASHBOARD') {
            console.log("Message received from dashboard. Calling native print.");
    
            if (window.AndroidInterface && typeof window.AndroidInterface.printPage === 'function') {
                console.log("Calling native Android print function with dashboard HTML.");
        
                // Find the dashboard iframe
                const dashboardIframe = document.getElementById('dashboardFrame');
        
                // Ensure the iframe and its content are accessible
                if (dashboardIframe && dashboardIframe.contentDocument && dashboardIframe.contentDocument.documentElement) {
                    
                    // Get the entire HTML content from the loaded dashboard inside the iframe
                    const dashboardHtml = dashboardIframe.contentDocument.documentElement.outerHTML;
        
                    // Call the printPage function that accepts the HTML string as an argument
                    window.AndroidInterface.printPage(dashboardHtml);
        
                } else {
                    console.error("Could not access the dashboard iframe content to print.");
                    alert("Error: The dashboard content could not be found for printing.");
                }
        
            } else {
                console.warn("Android interface not found. Cannot print.");
            }


        }
    });
    

        themeAuthentiCheckDarkBtn.addEventListener('click', () => applyTheme('authenticheck-dark'));
        themeLightBtn.addEventListener('click', () => applyTheme('light'));
        themeDarkBtn.addEventListener('click', () => applyTheme('dark'));
        themeBlueNeonBtn.addEventListener('click', () => applyTheme('blue-neon'));
        clearDataButton.addEventListener('click', clearAllData); // <-- ADD THIS LINE
    }

    init();
});
