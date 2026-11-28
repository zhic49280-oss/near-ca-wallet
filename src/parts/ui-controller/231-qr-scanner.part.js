  // ==================== QR Code Camera & Image Scanner ====================

  let _qrScanTarget = 'wc';
  let _qrMediaStream = null;
  let _qrScanTimer = null;
  let _qrScanHandling = false;
  let _qrVisibilityListener = null;

  function stopQrScannerStream() {
    if (_qrVisibilityListener && typeof document !== 'undefined') {
      document.removeEventListener('visibilitychange', _qrVisibilityListener);
      _qrVisibilityListener = null;
    }
    if (_qrScanTimer) {
      clearInterval(_qrScanTimer);
      _qrScanTimer = null;
    }
    if (_qrMediaStream) {
      try {
        _qrMediaStream.getTracks().forEach((track) => {
          try { track.stop(); } catch (_) {}
        });
      } catch (_) {}
      _qrMediaStream = null;
    }
    const videoEl = $('qr-scanner-video');
    if (videoEl) {
      try { videoEl.srcObject = null; } catch (_) {}
    }
  }

  function parseScannedAddressPayload(rawText) {
    const text = String(rawText || '').trim();
    if (!text) return { type: 'empty', value: '' };
    const wcUri = extractWcPairingUri(text);
    if (wcUri) {
      return { type: 'wc', value: wcUri };
    }
    let addr = text;
    const schemeMatch = addr.match(/^(?:ethereum|solana|bitcoin|pearl|near):(?:pay-)?([^?@]+)/i);
    if (schemeMatch && schemeMatch[1]) {
      addr = schemeMatch[1].trim();
    } else if (addr.includes('?')) {
      addr = addr.split('?')[0].trim();
    }
    return { type: 'address', value: addr };
  }

  async function handleQrScanResultAsync(rawText) {
    if (_qrScanHandling) return false;
    const parsed = parseScannedAddressPayload(rawText);
    if (!parsed.value) return false;
    _qrScanHandling = true;
    try {
      stopQrScannerStream();
      if (parsed.type === 'wc') {
        openSheet('sheet-walletconnect');
        if ($('wc-uri-input')) $('wc-uri-input').value = parsed.value;
        await pairWalletConnectUri();
        return true;
      }
      if (_qrScanTarget === 'send') {
        openSheet('sheet-send');
        if ($('send-recipient-input')) $('send-recipient-input').value = parsed.value;
        if (typeof handleSendRecipientInput === 'function') handleSendRecipientInput();
        showToast(`✅ ${t('已识别收款地址', 'Address scanned')}`);
        return true;
      }
      openSheet('sheet-walletconnect');
      showToast(t('未检测到 wc: 配对二维码，请扫描 WalletConnect 二维码', 'Not a WalletConnect wc: QR code'));
      return false;
    } finally {
      _qrScanHandling = false;
    }
  }

  async function openQrScannerSheet(target = 'wc') {
    _qrScanTarget = target === 'send' ? 'send' : 'wc';
    _qrScanHandling = false;
    stopQrScannerStream();
    openSheet('sheet-qr-scanner');
    const statusEl = $('qr-scanner-status');
    const videoEl = $('qr-scanner-video');
    if (statusEl) {
      statusEl.textContent = t('正在启动摄像头...', 'Starting camera...');
    }

    const hasMedia = typeof navigator !== 'undefined' && navigator.mediaDevices && typeof navigator.mediaDevices.getUserMedia === 'function';
    if (!hasMedia || !videoEl) {
      if (statusEl) {
        statusEl.textContent = t('当前环境不支持摄像头实时扫描，请点击「从相册选图」识别二维码', 'Camera unavailable here. Use "Pick from Album" to scan a QR screenshot.');
      }
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: 'environment' } },
        audio: false
      });
      if (!$('sheet-qr-scanner')?.classList?.contains('open')) {
        stream.getTracks().forEach((tr) => { try { tr.stop(); } catch (_) {} });
        return;
      }
      _qrMediaStream = stream;
      videoEl.srcObject = stream;
      await videoEl.play().catch(() => {});
      if (typeof document !== 'undefined') {
        _qrVisibilityListener = () => {
          if (document.hidden) {
            try { videoEl.pause(); } catch (_) {}
          } else if (_qrMediaStream) {
            videoEl.play().catch(() => {});
          }
        };
        document.addEventListener('visibilitychange', _qrVisibilityListener);
      }

      const DetectorCtor = (typeof window !== 'undefined' && window.BarcodeDetector) || (typeof globalThis !== 'undefined' && globalThis.BarcodeDetector);
      const getJsQrFn = () => (typeof window !== 'undefined' && window.jsQR) || (typeof globalThis !== 'undefined' && globalThis.jsQR) || null;
      if (typeof DetectorCtor !== 'function' && !getJsQrFn()) {
        await ensureJsQrLoaded();
      }
      if (typeof DetectorCtor === 'function') {
        const detector = new DetectorCtor({ formats: ['qr_code'] });
        if (statusEl) {
          statusEl.textContent = t('请将二维码对准取景框内', 'Align the QR code inside the frame');
        }
        _qrScanTimer = setInterval(async () => {
          if (typeof document !== 'undefined' && document.hidden) return;
          if (!_qrMediaStream || _qrScanHandling || videoEl.readyState < 2) return;
          try {
            const codes = await detector.detect(videoEl);
            const hit = Array.isArray(codes) && codes.find((c) => c && c.rawValue);
            if (hit && hit.rawValue) {
              await handleQrScanResultAsync(hit.rawValue);
            }
          } catch (_) {}
        }, 220);
      } else if (typeof getJsQrFn() === 'function' && typeof document !== 'undefined') {
        if (statusEl) {
          statusEl.textContent = t('请将二维码对准取景框内', 'Align the QR code inside the frame');
        }
        const canvas = document.createElement('canvas');
        const ctx2d = canvas.getContext ? canvas.getContext('2d', { willReadFrequently: true }) : null;
        _qrScanTimer = setInterval(async () => {
          if (typeof document !== 'undefined' && document.hidden) return;
          if (!_qrMediaStream || _qrScanHandling || videoEl.readyState < 2 || !ctx2d) return;
          const w = videoEl.videoWidth || 320;
          const h = videoEl.videoHeight || 240;
          if (!w || !h) return;
          canvas.width = w;
          canvas.height = h;
          ctx2d.drawImage(videoEl, 0, 0, w, h);
          try {
            const imgData = ctx2d.getImageData(0, 0, w, h);
            const jsQr = getJsQrFn();
            const code = jsQr ? jsQr(imgData.data, w, h) : null;
            if (code && code.data) {
              await handleQrScanResultAsync(code.data);
            }
          } catch (_) {}
        }, 260);
      } else if (statusEl) {
        statusEl.setAttribute('data-i18n-dynamic', '1');
        statusEl.textContent = t('当前设备暂不支持摄像头扫码，请返回直接粘贴地址或链接', 'Camera QR scanner is unsupported on this device; please go back and paste the address or link');
      }
    } catch (_) {
      if (statusEl) {
        statusEl.setAttribute('data-i18n-dynamic', '1');
        statusEl.textContent = t('无法访问摄像头（请检查相机权限），可点击「从相册选图」识别二维码', 'Camera access denied. Use "Pick from Album" to scan QR image.');
      }
    }
  }

  function closeQrScannerSheet() {
    stopQrScannerStream();
    if (_qrScanTarget === 'send') {
      openSheet('sheet-send');
    } else {
      openSheet('sheet-walletconnect');
    }
  }

  function triggerQrScannerFileInput() {
    const inp = $('qr-scanner-file-input');
    if (inp) {
      inp.value = '';
      inp.click();
    }
  }

  async function handleQrScannerFileSelect(event) {
    const file = event && event.target && event.target.files && event.target.files[0];
    if (!file) return;
    const DetectorCtor = (typeof window !== 'undefined' && window.BarcodeDetector) || (typeof globalThis !== 'undefined' && globalThis.BarcodeDetector);
    let jsQrFn = (typeof window !== 'undefined' && window.jsQR) || (typeof globalThis !== 'undefined' && globalThis.jsQR) || null;
    if (typeof DetectorCtor !== 'function' && typeof jsQrFn !== 'function') {
      jsQrFn = await ensureJsQrLoaded();
    }
    if (typeof DetectorCtor !== 'function' && typeof jsQrFn !== 'function') {
      showToast(t('当前设备不支持图片二维码识别，请直接复制 wc: 链接粘贴', 'Image QR decoding is unsupported on this device; paste the wc: link instead'));
      return;
    }
    try {
      let source = null;
      if (typeof createImageBitmap === 'function') {
        source = await createImageBitmap(file);
      } else if (typeof Image !== 'undefined' && typeof URL !== 'undefined' && typeof URL.createObjectURL === 'function') {
        const objUrl = URL.createObjectURL(file);
        source = await new Promise((resolve, reject) => {
          const img = new Image();
          img.onload = () => {
            try { URL.revokeObjectURL(objUrl); } catch (_) {}
            resolve(img);
          };
          img.onerror = (err) => {
            try { URL.revokeObjectURL(objUrl); } catch (_) {}
            reject(err);
          };
          img.src = objUrl;
        });
      }
      if (!source) throw new Error('Image decode unavailable');
      let rawQr = '';
      if (typeof DetectorCtor === 'function') {
        const detector = new DetectorCtor({ formats: ['qr_code'] });
        const codes = await detector.detect(source);
        const hit = Array.isArray(codes) && codes.find((c) => c && c.rawValue);
        if (hit && hit.rawValue) rawQr = hit.rawValue;
      } else if (typeof jsQrFn === 'function' && typeof document !== 'undefined') {
        const canvas = document.createElement('canvas');
        const w = source.width || source.naturalWidth || 400;
        const h = source.height || source.naturalHeight || 400;
        canvas.width = w;
        canvas.height = h;
        const ctx2d = canvas.getContext && canvas.getContext('2d');
        if (ctx2d) {
          ctx2d.drawImage(source, 0, 0, w, h);
          const imgData = ctx2d.getImageData(0, 0, w, h);
          const res = jsQrFn(imgData.data, w, h);
          if (res && res.data) rawQr = res.data;
        }
      }
      if (rawQr) {
        await handleQrScanResultAsync(rawQr);
      } else {
        showToast(t('未在图片中识别到有效二维码', 'No valid QR code found in image'));
      }
    } catch (_) {
      showToast(t('二维码图片识别失败，请重试或直接粘贴链接', 'Failed to decode QR image'));
    }
  }
