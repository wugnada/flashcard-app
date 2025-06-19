// PWA 서비스 워커 등록
if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js')
        .then(reg => {
            console.log('PWA Service Worker registered:', reg);
            
            // 서비스 워커 업데이트 확인
            reg.addEventListener('updatefound', () => {
                const newWorker = reg.installing;
                newWorker.addEventListener('statechange', () => {
                    if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                        // 새 버전이 설치됨을 사용자에게 알림
                        if (confirm('새 버전이 설치되었습니다. 페이지를 새로고침하시겠습니까?')) {
                            newWorker.postMessage({ type: 'SKIP_WAITING' });
                            window.location.reload();
                        }
                    }
                });
            });
        })
        .catch(err => console.log('PWA Service Worker registration failed:', err));
}

// 전역 설정 변수
let settings = {
    fontSize: 24,
    usageTime: 0,
    autoClearTime: 5 // 자동 초기화 시간 (초)
};

let isTyping = false;
let lastKeyTime = 0;
let usageTimer = null;
let autoClearTimer = null;
let deferredPrompt = null;

// DOM 요소들
const textEditor = document.getElementById('textEditor');
const contextMenu = document.getElementById('contextMenu');
const usageTimeDisplay = document.getElementById('usageTime');
const totalTimeDisplay = document.getElementById('totalTime');
const timePatternDisplay = document.getElementById('timePattern');
const autoClearIndicator = document.getElementById('autoClearIndicator');
const fontModal = document.getElementById('fontModal');
const autoClearModal = document.getElementById('autoClearModal');
const mobileModal = document.getElementById('mobileModal');
const installPrompt = document.getElementById('installPrompt');

// 초기화
function init() {
    loadSettings();
    loadTotalTime();
    updateUI();
    startUsageTimer();
    bindEvents();
    updateTimePattern();
    setupOrientationHandling();
    
    // PWA 설치 프롬프트 처리
    window.addEventListener('beforeinstallprompt', (e) => {
        e.preventDefault();
        deferredPrompt = e;
        showInstallPrompt();
    });
}

// 화면 방향 및 크기 변화 처리
function setupOrientationHandling() {
    // 화면 방향 변화 감지
    window.addEventListener('orientationchange', () => {
        setTimeout(() => {
            adjustLayoutForOrientation();
            updateUI();
        }, 100);
    });

    // 윈도우 크기 변화 감지 (멀티윈도우)
    window.addEventListener('resize', () => {
        adjustLayoutForOrientation();
    });

    // 초기 레이아웃 조정
    adjustLayoutForOrientation();
}

// 방향과 크기에 따른 레이아웃 조정
function adjustLayoutForOrientation() {
    const isLandscape = window.innerWidth > window.innerHeight;
    const isSmallScreen = window.innerHeight < 400 || window.innerWidth < 400;
    
    // 작은 화면에서 폰트 크기 동적 조정
    if (isSmallScreen) {
        const minFontSize = isLandscape ? 14 : 16;
        const maxFontSize = Math.max(minFontSize, Math.min(settings.fontSize, 20));
        textEditor.style.fontSize = maxFontSize + 'px';
    } else {
        textEditor.style.fontSize = settings.fontSize + 'px';
    }

    // 매우 작은 멀티윈도우에서 정보 단순화
    if (window.innerWidth < 320 || window.innerHeight < 200) {
        usageTimeDisplay.textContent = formatUsageTime(settings.usageTime, true);
        totalTimeDisplay.textContent = `총: ${formatUsageTime(loadTotalTime() + settings.usageTime, true)}`;
        timePatternDisplay.textContent = '';
    } else {
        updateUsageTimeDisplay();
        updateTotalTimeDisplay();
        if (timePatternDisplay.textContent === '') {
            updateTimePattern();
        }
    }
}

// 설정 로드
function loadSettings() {
    try {
        const saved = localStorage.getItem('textEditorSettings');
        if (saved) {
            const parsed = JSON.parse(saved);
            settings = { ...settings, ...parsed };
        }
    } catch (e) {
        console.log('설정 로드 실패, 기본값 사용');
    }
    updateFontSize();
}

// 오늘 총 사용 시간 로드
function loadTotalTime() {
    try {
        const today = new Date().toDateString();
        const saved = localStorage.getItem('textEditorTotalTime');
        if (saved) {
            const data = JSON.parse(saved);
            return data[today] || 0;
        }
    } catch (e) {
        console.log('총 사용 시간 로드 실패');
    }
    return 0;
}

// 오늘 총 사용 시간 저장
function saveTotalTime(totalSeconds) {
    try {
        const today = new Date().toDateString();
        let data = {};
        const saved = localStorage.getItem('textEditorTotalTime');
        if (saved) {
            data = JSON.parse(saved);
        }
        data[today] = totalSeconds;
        localStorage.setItem('textEditorTotalTime', JSON.stringify(data));
    } catch (e) {
        console.log('총 사용 시간 저장 실패');
    }
}

// 시간대별 사용 패턴 저장
function saveTimePattern() {
    try {
        const now = new Date();
        const today = now.toDateString();
        const hour = now.getHours();
        
        let patterns = {};
        const saved = localStorage.getItem('textEditorTimePatterns');
        if (saved) {
            patterns = JSON.parse(saved);
        }
        
        if (!patterns[today]) {
            patterns[today] = {};
        }
        
        patterns[today][hour] = (patterns[today][hour] || 0) + 1;
        localStorage.setItem('textEditorTimePatterns', JSON.stringify(patterns));
    } catch (e) {
        console.log('시간 패턴 저장 실패');
    }
}

// 시간대 패턴 분석 및 표시
function updateTimePattern() {
    try {
        const saved = localStorage.getItem('textEditorTimePatterns');
        if (!saved) {
            timePatternDisplay.textContent = '패턴 분석 중...';
            return;
        }
        
        const patterns = JSON.parse(saved);
        const today = new Date().toDateString();
        
        // 최근 7일간의 패턴 분석
        const recentDays = Object.keys(patterns).slice(-7);
        const hourCounts = {};
        
        recentDays.forEach(day => {
            Object.entries(patterns[day] || {}).forEach(([hour, count]) => {
                hourCounts[hour] = (hourCounts[hour] || 0) + count;
            });
        });
        
        if (Object.keys(hourCounts).length === 0) {
            timePatternDisplay.textContent = '패턴 분석 중...';
            return;
        }
        
        // 가장 활발한 시간대 찾기
        const mostActiveHour = Object.entries(hourCounts)
            .sort(([,a], [,b]) => b - a)[0][0];
        
        const hour24 = parseInt(mostActiveHour);
        const hour12 = hour24 === 0 ? 12 : hour24 > 12 ? hour24 - 12 : hour24;
        const ampm = hour24 < 12 ? '오전' : '오후';
        
        timePatternDisplay.textContent = `주로 ${ampm} ${hour12}시에 연습해요! 📚`;
    } catch (e) {
        timePatternDisplay.textContent = '패턴 분석 중...';
    }
}

// 설정 저장
function saveSettings() {
    try {
        localStorage.setItem('textEditorSettings', JSON.stringify(settings));
    } catch (e) {
        console.log('설정 저장 실패');
    }
}

// UI 업데이트
function updateUI() {
    updateFontSize();
    updateUsageTimeDisplay();
    updateTotalTimeDisplay();
    updateAutoClearIndicator();
    updatePlaceholder();
}

// 폰트 크기 업데이트
function updateFontSize() {
    textEditor.style.fontSize = settings.fontSize + 'px';
    if (document.getElementById('currentFontSize')) {
        document.getElementById('currentFontSize').textContent = `현재 폰트 크기: ${settings.fontSize}`;
    }
}

// placeholder 텍스트 업데이트
function updatePlaceholder() {
    if (settings.autoClearTime > 0) {
        textEditor.placeholder = `여기에 텍스트를 입력하세요... (타이핑 중단 후 ${settings.autoClearTime}초 뒤 자동 초기화)`;
    } else {
        textEditor.placeholder = `여기에 텍스트를 입력하세요... (자동 초기화 해제됨)`;
    }
}

// 현재 세션 사용 시간 표시 업데이트
function updateUsageTimeDisplay() {
    const timeText = formatUsageTime(settings.usageTime);
    const statusText = isTyping ? ' ⌨️' : '';
    usageTimeDisplay.textContent = timeText + statusText;
}

// 오늘 총 사용 시간 표시 업데이트
function updateTotalTimeDisplay() {
    const totalTime = loadTotalTime() + settings.usageTime;
    totalTimeDisplay.textContent = `오늘 총 사용: ${formatUsageTime(totalTime)}`;
}

// 자동 초기화 표시 업데이트
function updateAutoClearIndicator() {
    if (settings.autoClearTime > 0) {
        autoClearIndicator.textContent = `${settings.autoClearTime}초 후 자동 초기화`;
    } else {
        autoClearIndicator.textContent = '자동 초기화 해제';
    }
    
    // 현재 설정 표시 업데이트
    if (document.getElementById('currentAutoClearTime')) {
        const timeText = settings.autoClearTime === 0 ? '끄기' : `${settings.autoClearTime}초`;
        document.getElementById('currentAutoClearTime').textContent = `현재 설정: ${timeText}`;
    }
}

function formatUsageTime(seconds, compact = false) {
    if (compact) {
        // 작은 화면용 간략 표시
        if (seconds < 60) {
            return `${seconds}s`;
        } else if (seconds < 3600) {
            const minutes = Math.floor(seconds / 60);
            return `${minutes}m`;
        } else {
            const hours = Math.floor(seconds / 3600);
            const minutes = Math.floor((seconds % 3600) / 60);
            return minutes === 0 ? `${hours}h` : `${hours}h${minutes}m`;
        }
    }
    
    // 일반 표시
    if (seconds < 60) {
        return `${seconds}초`;
    } else if (seconds < 3600) {
        const minutes = Math.floor(seconds / 60);
        const remainingSeconds = seconds % 60;
        if (remainingSeconds === 0) {
            return `${minutes}분`;
        } else {
            return `${minutes}분 ${remainingSeconds}초`;
        }
    } else {
        const hours = Math.floor(seconds / 3600);
        const minutes = Math.floor((seconds % 3600) / 60);
        if (minutes === 0) {
            return `${hours}시간`;
        } else {
            return `${hours}시간 ${minutes}분`;
        }
    }
}

// 이벤트 바인딩
function bindEvents() {
    textEditor.addEventListener('input', onTextChange);
    textEditor.addEventListener('keydown', onKeyDown);
    textEditor.addEventListener('keyup', onKeyUp);
    textEditor.addEventListener('blur', onEditorBlur);
    textEditor.addEventListener('focus', onEditorFocus);
    textEditor.addEventListener('contextmenu', showContextMenu);
    document.addEventListener('click', hideContextMenu);

    // 초기화 버튼 이벤트 명시적 바인딩
    const resetArea = document.querySelector('.reset-area');
    if (resetArea) {
        resetArea.addEventListener('click', resetText);
        resetArea.addEventListener('touchstart', resetText); // 모바일 터치 지원
    }

    fontModal.addEventListener('click', (e) => {
        if (e.target === fontModal) closeFontModal();
    });
    autoClearModal.addEventListener('click', (e) => {
        if (e.target === autoClearModal) closeAutoClearModal();
    });
    mobileModal.addEventListener('click', (e) => {
        if (e.target === mobileModal) closeMobileModal();
    });

    document.getElementById('fontSizeInput').addEventListener('keydown', (e) => {
        if (e.key === 'Enter') applyCustomFontSize();
    });
    document.getElementById('autoClearInput').addEventListener('keydown', (e) => {
        if (e.key === 'Enter') applyCustomAutoClearTime();
    });
}

// 텍스트 변경 시
function onTextChange() {
    startTyping();
    resetAutoClearTimer();
}

// 키 입력 시
function onKeyDown(e) {
    const isTypingKey = !e.ctrlKey && !e.altKey && !e.metaKey && 
                       (e.key.length === 1 || 
                        ['Backspace', 'Delete', 'Enter', 'Tab'].includes(e.key));
    
    if (isTypingKey) {
        startTyping();
        resetAutoClearTimer();
    }
}

// 키를 뗄 때
function onKeyUp(e) {
    if (isTyping) {
        lastKeyTime = Date.now();
    }
}

// 에디터 포커스 잃을 때
function onEditorBlur() {
    stopTyping();
    startAutoClearTimer();
}

// 에디터 포커스 받을 때
function onEditorFocus() {
    resetAutoClearTimer();
}

// 타이핑 시작
function startTyping() {
    if (!isTyping) {
        isTyping = true;
        updateUsageTimeDisplay();
        saveTimePattern(); // 시간대 패턴 저장
        hapticFeedback(10); // 가벼운 진동
    }
    lastKeyTime = Date.now();
}

// 타이핑 중단
function stopTyping() {
    if (isTyping) {
        isTyping = false;
        updateUsageTimeDisplay();
        startAutoClearTimer();
    }
}

// 자동 초기화 타이머 시작
function startAutoClearTimer() {
    if (settings.autoClearTime > 0 && textEditor.value.trim()) {
        autoClearTimer = setTimeout(() => {
            resetText();
            autoClearIndicator.classList.remove('active');
            hapticFeedback(100);
        }, settings.autoClearTime * 1000);
        
        autoClearIndicator.classList.add('active');
    }
}

// 자동 초기화 타이머 리셋
function resetAutoClearTimer() {
    if (autoClearTimer) {
        clearTimeout(autoClearTimer);
        autoClearTimer = null;
    }
    autoClearIndicator.classList.remove('active');
}

// 자동 초기화 시간 설정
function setAutoClearTime(seconds) {
    settings.autoClearTime = seconds;
    updateAutoClearIndicator();
    updatePlaceholder();
    saveSettings();
    hideContextMenu();
    resetAutoClearTimer();
    hapticFeedback(30);
}

// 사용자 지정 자동 초기화 시간 다이얼로그
function showAutoClearDialog() {
    hideContextMenu();
    document.getElementById('autoClearInput').value = settings.autoClearTime;
    updateAutoClearIndicator(); // 현재 설정 표시 업데이트
    autoClearModal.style.display = 'flex';
    document.getElementById('autoClearInput').focus();
}

// 사용자 지정 자동 초기화 시간 적용
function applyCustomAutoClearTime() {
    const input = document.getElementById('autoClearInput');
    const seconds = parseInt(input.value);
    
    if (seconds === 0) {
        // 0은 끄기
        setAutoClearTime(0);
        closeAutoClearModal();
    } else if (seconds >= 5 && seconds <= 60) {
        setAutoClearTime(seconds);
        closeAutoClearModal();
    } else {
        hapticFeedback([50, 50, 50]);
        input.focus();
    }
}

// 자동 초기화 모달 닫기
function closeAutoClearModal() {
    autoClearModal.style.display = 'none';
}

// 컨텍스트 메뉴 표시
function showContextMenu(e) {
    e.preventDefault();
    contextMenu.style.display = 'block';
    contextMenu.style.left = e.pageX + 'px';
    contextMenu.style.top = e.pageY + 'px';

    const rect = contextMenu.getBoundingClientRect();
    if (rect.right > window.innerWidth) {
        contextMenu.style.left = (e.pageX - rect.width) + 'px';
    }
    if (rect.bottom > window.innerHeight) {
        contextMenu.style.top = (e.pageY - rect.height) + 'px';
    }
}

// 컨텍스트 메뉴 숨기기
function hideContextMenu() {
    contextMenu.style.display = 'none';
}

// 폰트 크기 설정
function setFontSize(size) {
    settings.fontSize = size;
    updateFontSize();
    saveSettings();
    hideContextMenu();
    hapticFeedback(30);
}

// 사용자 지정 폰트 크기 다이얼로그
function showCustomFontDialog() {
    hideContextMenu();
    document.getElementById('fontSizeInput').value = settings.fontSize;
    fontModal.style.display = 'flex';
    document.getElementById('fontSizeInput').focus();
}

// 사용자 지정 폰트 크기 적용
function applyCustomFontSize() {
    const input = document.getElementById('fontSizeInput');
    const size = parseInt(input.value);
    
    if (size >= 6 && size <= 72) {
        setFontSize(size);
        closeFontModal();
    } else {
        hapticFeedback([50, 50, 50]);
        input.focus();
    }
}

// 폰트 모달 닫기
function closeFontModal() {
    fontModal.style.display = 'none';
}

// 텍스트 초기화
function resetText() {
    textEditor.value = '';
    textEditor.focus(); // 포커스 다시 주기
    stopTyping();
    resetAutoClearTimer();
    hideContextMenu();
    hapticFeedback(100);
    
    // 시각적 피드백
    const resetArea = document.querySelector('.reset-area');
    if (resetArea) {
        resetArea.style.backgroundColor = '#333';
        setTimeout(() => {
            resetArea.style.backgroundColor = '#111';
        }, 200);
    }
    
    textEditor.classList.add('vibrate');
    setTimeout(() => textEditor.classList.remove('vibrate'), 300);
}

// 텍스트 복사
async function copyText() {
    if (!textEditor.value.trim()) {
        hapticFeedback([50, 50, 50]);
        return;
    }
    
    try {
        await navigator.clipboard.writeText(textEditor.value);
        hapticFeedback(50);
    } catch (e) {
        hapticFeedback([50, 50, 50]);
    }
}

// 현재 세션 시간 초기화
function resetUsageTime() {
    // 현재 세션 시간을 오늘 총 시간에 더하고 저장
    const currentTotal = loadTotalTime();
    saveTotalTime(currentTotal + settings.usageTime);
    
    settings.usageTime = 0;
    updateUsageTimeDisplay();
    updateTotalTimeDisplay();
    saveSettings();
    hideContextMenu();
    hapticFeedback(100);
}

// 오늘 총 시간 초기화
function resetTotalTime() {
    saveTotalTime(0);
    settings.usageTime = 0;
    updateUsageTimeDisplay();
    updateTotalTimeDisplay();
    saveSettings();
    hideContextMenu();
    hapticFeedback(100);
}

// 앱 공유
async function shareApp() {
    if (navigator.share) {
        try {
            await navigator.share({
                title: 'CMD 스타일 텍스트 에디터',
                text: '안드로이드용 텍스트 연습 앱을 사용해보세요!',
                url: window.location.href
            });
        } catch (e) {
            console.log('공유 실패');
        }
    } else {
        // 공유 API가 없으면 URL 복사
        try {
            await navigator.clipboard.writeText(window.location.href);
            hapticFeedback(50);
        } catch (e) {
            console.log('URL 복사 실패');
        }
    }
    hideContextMenu();
}

// 모바일 메뉴 표시
function showMobileMenu() {
    mobileModal.style.display = 'flex';
}

// 모바일 메뉴 닫기
function closeMobileModal() {
    mobileModal.style.display = 'none';
}

// 햅틱 피드백
function hapticFeedback(duration = 50) {
    if (navigator.vibrate) {
        navigator.vibrate(duration);
    }
}

// PWA 설치 프롬프트 표시
function showInstallPrompt() {
    setTimeout(() => {
        installPrompt.style.display = 'flex';
    }, 5000); // 5초 후 표시
}

// PWA 설치
async function installApp() {
    if (deferredPrompt) {
        deferredPrompt.prompt();
        const { outcome } = await deferredPrompt.userChoice;
        if (outcome === 'accepted') {
            installPrompt.style.display = 'none';
        }
        deferredPrompt = null;
    }
}

// 사용 시간 타이머
function startUsageTimer() {
    usageTimer = setInterval(() => {
        if (isTyping) {
            settings.usageTime++;
            updateUsageTimeDisplay();
            updateTotalTimeDisplay();
            saveSettings();
            
            // 10분마다 시간 패턴 업데이트
            if (settings.usageTime % 600 === 0) {
                updateTimePattern();
            }
        }

        // 1초 이상 입력이 없으면 타이핑 상태 해제
        if (isTyping && Date.now() - lastKeyTime > 1000) {
            stopTyping();
        }
    }, 1000);
}

// 페이지 언로드 시 총 시간 저장
window.addEventListener('beforeunload', () => {
    if (settings.usageTime > 0) {
        const currentTotal = loadTotalTime();
        saveTotalTime(currentTotal + settings.usageTime);
    }
});

// 뒤로가기 버튼 처리 (안드로이드)
window.addEventListener('popstate', function(e) {
    const activeModal = document.querySelector('.modal[style*="flex"]');
    if (activeModal) {
        e.preventDefault();
        activeModal.style.display = 'none';
        return false;
    }
});

// DOMContentLoaded 이벤트에서 초기화 실행
document.addEventListener('DOMContentLoaded', init);
