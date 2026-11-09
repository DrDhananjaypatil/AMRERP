import { useEffect, useRef, useState } from 'react';
import { Modal } from './ui';

// Phone/laptop camera scanner for QR codes and barcodes.
// `continuous` keeps scanning so several serials can be scanned in a row.
export default function Scanner({ onScan, onClose, continuous = false, title = 'Scan QR / barcode' }) {
  const [error, setError] = useState(null);
  const [last, setLast] = useState('');
  const scannerRef = useRef(null);
  const lastRef = useRef({ text: '', at: 0 });

  useEffect(() => {
    let stopped = false;
    (async () => {
      try {
        const { Html5Qrcode } = await import('html5-qrcode');
        if (stopped) return;
        const sc = new Html5Qrcode('scanner-view');
        scannerRef.current = sc;
        await sc.start(
          { facingMode: 'environment' },
          { fps: 10, qrbox: { width: 240, height: 240 } },
          (text) => {
            const now = Date.now();
            // ignore the same code read again within 2 seconds
            if (text === lastRef.current.text && now - lastRef.current.at < 2000) return;
            lastRef.current = { text, at: now };
            setLast(text);
            if (navigator.vibrate) navigator.vibrate(60);
            onScan(text);
            if (!continuous) onClose();
          },
          () => {},
        );
      } catch (e) {
        setError(e?.message?.includes('Permission') || e?.name === 'NotAllowedError'
          ? 'Camera permission was denied. Allow camera access for this site in the browser settings.'
          : `Could not start the camera: ${e?.message || e}`);
      }
    })();
    return () => {
      stopped = true;
      const sc = scannerRef.current;
      if (sc) sc.stop().then(() => sc.clear()).catch(() => {});
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <Modal title={title} onClose={onClose} footer={<button className="btn" onClick={onClose}>Done</button>}>
      <div id="scanner-view" className="scanner-view" />
      {last && <p className="ok-note">Scanned: <b>{last}</b>{continuous && ' — scan the next one'}</p>}
      {error && <div className="error-note">{error}</div>}
      <p className="muted small">Point the camera at the QR code or barcode. Works on phones and laptops with a camera; the site must be opened over https.</p>
    </Modal>
  );
}
