import { useState, useRef, useEffect } from "react";
import "./App.css";

// Served from the same Django app (mounted at "/"), so a relative path works
// whether this is running on localhost, onrender.com, or anywhere else —
// no origin to hardcode or swap between environments.
const ENDPOINT = "/user/ai_check/";

const PIPELINE_STEPS = [
  {
    index: "01",
    title: "DETECT & CROP",
    body: "A face detector locates the face in each image and crops it out from the background.",
  },
  {
    index: "02",
    title: "EMBED",
    body: "The cropped face is converted into a numeric vector that represents its features.",
  },
  {
    index: "03",
    title: "COMPARE",
    body: "The two vectors are compared by distance. Below a tuned threshold, they're the same person.",
  },
  {
    index: "04",
    title: "READ DOCUMENT",
    body: "OCR runs on the ID card in parallel, pulling out any printed text on it.",
  },
];

export default function AiCheckTester() {
  const [idCard, setIdCard] = useState(null);
  const [selfie, setSelfie] = useState(null);
  const [response, setResponse] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async () => {
    if (!idCard || !selfie) {
      setError("Add both an ID card and a selfie before running verification.");
      return;
    }
    setError(null);
    setResponse(null);
    setLoading(true);

    const formData = new FormData();
    formData.append("id_card", idCard);
    formData.append("selfie", selfie);

    try {
      const res = await fetch(ENDPOINT, { method: "POST", body: formData });
      const data = await res.json();
      setResponse({ status: res.status, data });
    } catch (err) {
      setError(err.message || "Request failed.");
    } finally {
      setLoading(false);
    }
  };

  const canSubmit = idCard && selfie && !loading;

  return (
    <div className="scanpage">
      <div className="scanpage__grid" aria-hidden="true" />

      <header className="scanhead">
        <span className="eyebrow">IDENTITY VERIFICATION</span>
        <h1 className="title">
          ID VERIFY<span className="cursor" aria-hidden="true">_</span>
        </h1>
        <p className="subtitle">
          Matches a selfie against an ID photo and reads the printed text on the document.
        </p>
      </header>

      <main className="console">
        <section className="capture" aria-label="Capture inputs">
          <CaptureSlot
            index="01"
            label="ID CARD"
            hint="Front of a government ID"
            file={idCard}
            onFileChange={setIdCard}
          />
          <CaptureSlot
            index="02"
            label="SELFIE"
            hint="Clear, front-facing photo"
            file={selfie}
            onFileChange={setSelfie}
          />

          <button className="run-btn" onClick={handleSubmit} disabled={!canSubmit}>
            <span className={`run-dot ${loading ? "run-dot--active" : ""}`} />
            {loading ? "VERIFYING…" : "RUN VERIFICATION"}
          </button>

          {error && <div className="alert">{error}</div>}
        </section>

        <section className="readout" aria-label="Verification result" aria-live="polite">
          <div className="readout__bar">
            <span className="readout__title">VERIFICATION LOG</span>
            <span className={`readout__status readout__status--${statusTone(loading, response)}`}>
              {statusLabel(loading, response)}
            </span>
          </div>
          <div className="readout__body">
            <ReadoutBody loading={loading} response={response} />
          </div>
        </section>
      </main>

      <HowItWorks />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* How it works: a short explainer of the verification pipeline       */
/* ------------------------------------------------------------------ */

function HowItWorks() {
  return (
    <section className="about" aria-label="How it works">
      <div className="about__header">
        <span className="about__title">HOW IT WORKS</span>
        <span className="about__rule" aria-hidden="true" />
      </div>
      <div className="about__steps">
        {PIPELINE_STEPS.map((step) => (
          <div className="about__step" key={step.index}>
            <span className="about__step-index">{step.index}</span>
            <span className="about__step-title">{step.title}</span>
            <p className="about__step-body">{step.body}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Capture slot: upload a file OR take a photo with the device camera */
/* ------------------------------------------------------------------ */

function CaptureSlot({ index, label, hint, file, onFileChange }) {
  const [mode, setMode] = useState("upload"); // "upload" | "camera"
  const [streaming, setStreaming] = useState(false);
  const [preview, setPreview] = useState(null);
  const [cameraError, setCameraError] = useState(null);

  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const streamRef = useRef(null);
  const fileInputRef = useRef(null);

  // Keep the preview URL in sync with whatever file the parent is holding,
  // and revoke old object URLs so we don't leak memory.
  useEffect(() => {
    if (!file) {
      setPreview(null);
      return;
    }
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  // Always stop the camera stream when the component unmounts.
  useEffect(() => stopCamera, []);

  // Attach the stream to the <video> element only once it's actually mounted.
  // (It doesn't mount until `streaming` is true, so doing this at
  // getUserMedia-resolve time is too early — videoRef.current is still null.)
  useEffect(() => {
    if (streaming && videoRef.current && streamRef.current) {
      videoRef.current.srcObject = streamRef.current;
      videoRef.current.play().catch(() => {
        /* autoplay can reject if the tab isn't focused yet; harmless */
      });
    }
  }, [streaming]);

  function stopCamera() {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    setStreaming(false);
  }

  async function startCamera() {
    setCameraError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user" },
        audio: false,
      });
      streamRef.current = stream;
      setMode("camera");
      setStreaming(true); // triggers the effect above once <video> is mounted
    } catch (err) {
      setCameraError("Couldn't access the camera. Check permissions and try again.");
      setMode("camera");
      setStreaming(false);
    }
  }

  function switchToUpload() {
    stopCamera();
    setCameraError(null);
    setMode("upload");
  }

  function capturePhoto() {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas || !video.videoWidth) return;

    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext("2d").drawImage(video, 0, 0, canvas.width, canvas.height);

    canvas.toBlob(
      (blob) => {
        if (!blob) return;
        const fileName = `${label.toLowerCase().replace(/\s+/g, "-")}-${Date.now()}.jpg`;
        onFileChange(new File([blob], fileName, { type: "image/jpeg" }));
        stopCamera();
      },
      "image/jpeg",
      0.92
    );
  }

  function retake() {
    onFileChange(null);
    startCamera();
  }

  function chooseDifferentFile() {
    onFileChange(null);
    fileInputRef.current?.click();
  }

  const showingLiveCamera = mode === "camera" && streaming && !file;

  return (
    <div className="slot">
      <div className="slot__frame">
        <span className="reticle reticle--tl" />
        <span className="reticle reticle--tr" />
        <span className="reticle reticle--bl" />
        <span className="reticle reticle--br" />

        {file && preview ? (
          <img src={preview} alt={label} className="slot__preview" />
        ) : showingLiveCamera ? (
          <video ref={videoRef} className="slot__video" muted playsInline />
        ) : (
          <label className="slot__placeholder">
            <span className="slot__index">{index}</span>
            <span className="slot__hint">{hint}</span>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="slot__input"
              onChange={(e) => onFileChange(e.target.files?.[0] ?? null)}
            />
          </label>
        )}

        <canvas ref={canvasRef} className="slot__canvas" />
      </div>

      <div className="slot__footer">
        <span className="slot__label">
          {index} — {label}
        </span>

        {file ? (
          <button type="button" className="slot__link" onClick={chooseDifferentFile}>
            change photo
          </button>
        ) : showingLiveCamera ? (
          <div className="slot__camera-controls">
            <button type="button" className="shutter" onClick={capturePhoto} aria-label="Capture photo" />
            <button type="button" className="slot__link" onClick={switchToUpload}>
              cancel
            </button>
          </div>
        ) : (
          <div className="slot__modes">
            <button type="button" className="slot__link" onClick={() => fileInputRef.current?.click()}>
              upload
            </button>
            <span className="slot__sep">/</span>
            <button type="button" className="slot__link" onClick={startCamera}>
              use camera
            </button>
          </div>
        )}
      </div>

      {cameraError && <div className="slot__error">{cameraError}</div>}
      {file && mode === "camera" && (
        <button type="button" className="slot__link slot__retake" onClick={retake}>
          retake photo
        </button>
      )}
    </div>
  );
}

function statusTone(loading, response) {
  if (loading) return "pending";
  if (!response) return "idle";
  if (response.status >= 400) return "error";
  if (response.data?.face_match) return "success";
  return "warn";
}

function statusLabel(loading, response) {
  if (loading) return "RUNNING";
  if (!response) return "AWAITING INPUT";
  if (response.status >= 400) return `ERROR ${response.status}`;
  return `OK ${response.status}`;
}

function ReadoutBody({ loading, response }) {
  if (loading) {
    return (
      <div className="log">
        <LogLine prompt>initializing model pipeline…</LogLine>
        <LogLine prompt>detecting faces, cropping regions…</LogLine>
        <LogLine prompt>running OCR on document…</LogLine>
      </div>
    );
  }

  if (!response) {
    return (
      <div className="log log--idle">
        <LogLine dim>select or capture an ID card and a selfie, then run verification</LogLine>
        <span className="blink-cursor" aria-hidden="true">_</span>
      </div>
    );
  }

  const { data, status } = response;

  if (status >= 400 || data?.error) {
    return (
      <div className="log">
        <LogLine tone="error">request failed ({status})</LogLine>
        <LogLine tone="error">{data?.error || "Unknown error"}</LogLine>
      </div>
    );
  }

  return (
    <div className="log">
      <LogLine>
        face_match:{" "}
        <span className={data.face_match ? "val val--good" : "val val--bad"}>
          {String(!!data.face_match)}
        </span>
      </LogLine>
      {typeof data.face_distance === "number" && (
        <LogLine>distance: <span className="val">{data.face_distance.toFixed(4)}</span></LogLine>
      )}
      {data.face_error && <LogLine tone="warn">face_error: {data.face_error}</LogLine>}
      {data.ocr_error && <LogLine tone="warn">ocr_error: {data.ocr_error}</LogLine>}
      <LogLine>extracted_text:</LogLine>
      <pre className="log__block">{data.extracted_text || "(no text detected)"}</pre>
    </div>
  );
}

function LogLine({ children, tone, dim, prompt }) {
  return (
    <div className={`logline ${tone ? `logline--${tone}` : ""} ${dim ? "logline--dim" : ""}`}>
      <span className="logline__chevron">{prompt ? "»" : ">"}</span> {children}
    </div>
  );
}