import React, { useId, useMemo, useRef, useState } from 'react';
import QRCode from 'qrcode';
import { projectHomeUrl } from './reportTools.js';

export function ProjectQrGraphic({ url, size = 96 }) {
  const code = useMemo(() => QRCode.create(url, { errorCorrectionLevel: 'M' }), [url]);
  const quietZone = 4;
  const dimension = code.modules.size + quietZone * 2;
  const path = [];
  code.modules.data.forEach((value, index) => {
    if (value) path.push(`M${index % code.modules.size + quietZone} ${Math.floor(index / code.modules.size) + quietZone}h1v1h-1z`);
  });
  return <svg role="img" aria-label="Scan QR code to open this project" width={size} height={size} viewBox={`0 0 ${dimension} ${dimension}`} shapeRendering="crispEdges" className="project-qr-image">
    <title>{url}</title>
    <rect width={dimension} height={dimension} fill="#fff" />
    <path d={path.join('')} fill="#000" />
  </svg>;
}

export default function ProjectQrBlock() {
  const [url] = useState(() => projectHomeUrl(typeof window !== 'undefined' ? window.location.href : ''));
  const dialog = useRef(null);
  const dialogId = useId();
  const [downloading, setDownloading] = useState(false);
  const [downloadError, setDownloadError] = useState('');

  const downloadQr = async () => {
    setDownloading(true);
    setDownloadError('');
    try {
      const image = await QRCode.toDataURL(url, { width: 1024, margin: 4, errorCorrectionLevel: 'M' });
      const link = document.createElement('a');
      link.href = image;
      link.download = 'SG-Green-Breakdown-QR.png';
      document.body.appendChild(link);
      link.click();
      link.remove();
    } catch {
      setDownloadError('QR download nahi hua. Dobara try karein.');
    } finally {
      setDownloading(false);
    }
  };

  return <>
    <button type="button" className="page-block project-qr-block" aria-label="QR Code" aria-haspopup="dialog" aria-controls={dialogId} onClick={() => { setDownloadError(''); dialog.current?.showModal(); }}>
      QR Code
    </button>
    <dialog ref={dialog} id={dialogId} aria-labelledby={`${dialogId}-title`} className="project-qr-dialog">
      <div className="flex justify-between items-center gap-4 mb-3">
        <h2 id={`${dialogId}-title`} className="font-extrabold text-amber-900">Open Breakdown Report</h2>
        <button type="button" autoFocus onClick={() => dialog.current?.close()} aria-label="Close QR code" className="px-3 py-1 rounded-lg bg-amber-100 text-amber-900 text-xl">×</button>
      </div>
      {url && <div className="flex justify-center"><ProjectQrGraphic url={url} size={320} /></div>}
      <p className="text-center text-sm text-slate-600 mt-3">Phone camera se scan karke yahi project kholein.</p>
      {url && <a href={url} className="block text-center text-xs text-teal-800 break-all mt-2 underline">{url}</a>}
      <button type="button" onClick={downloadQr} disabled={!url || downloading} className="project-qr-download">
        {downloading ? 'Downloading…' : 'Download QR Code (PNG)'}
      </button>
      {downloadError && <p role="alert" className="text-sm text-red-700 mt-3 text-center">{downloadError}</p>}
    </dialog>
  </>;
}
