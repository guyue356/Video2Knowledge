"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { useStageData, type TabKey } from "./useStageData";
import StageViewer from "./StageViewer";
import PromptSettings from "./PromptSettings";
import PresetSelector from "./PresetSelector";
import PresetManager from "./PresetManager";
import ProcessingWorkspace from "./ProcessingWorkspace";

const API_BASE = "http://localhost:8001";

type AsrProvider = "whisper" | "mimo";

const STEPS = [
  "extract_audio",
  "transcribe",
  "segment_chapters",
  "extract_knowledge",
  "generate_blog",
];

const STEP_LABELS: Record<string, string> = {
  extract_audio: "音频提取",
  transcribe: "语音转录",
  segment_chapters: "章节划分",
  extract_knowledge: "知识提取",
  generate_blog: "文章生成",
};

interface StepState {
  status: "pending" | "active" | "completed" | "error";
  progressPct: number;
  detail: string;
  message: string;
  result: unknown;
  startedAt?: number;
  finishedAt?: number;
  apiProgress?: {
    completed: number;
    total: number;
    current?: number;
  };
}

interface VideoItem {
  task_id: string;
  title: string;
  filename: string;
  status: string;
  duration: number;
  processing_duration: number | null;
  has_blog: boolean;
  source_type: string;
  source_url: string;
  created_at: string | null;
}

interface VideoDetail {
  task_id: string;
  title: string;
  filename: string;
  status: string;
  duration: number;
  processing_duration: number | null;
  source_type: string;
  source_url: string;
  created_at: string | null;
  blog: { id: number; title: string; markdown: string } | null;
  transcript_segments: number;
  chapters_count: number;
  concepts_count: number;
}

const SOURCE_LABELS: Record<string, string> = {
  video: "视频",
  audio: "音频",
  url: "链接",
};

const STATUS_LABELS: Record<string, string> = {
  completed: "已完成",
  failed: "失败",
  cancelled: "已终止",
  pending: "待启动",
  extracting_audio: "提取音频",
  transcribing: "转录中",
  segmenting: "分段中",
  extracting_knowledge: "提取知识",
  generating_blog: "生成文章",
};

const STATUS_DOT_COLORS: Record<string, string> = {
  completed: "is-completed",
  failed: "bg-red-600",
  cancelled: "bg-zinc-400",
  pending: "bg-amber-500",
  extracting_audio: "bg-blue-600",
  transcribing: "bg-blue-600",
  segmenting: "bg-blue-600",
  extracting_knowledge: "bg-blue-600",
  generating_blog: "bg-blue-600",
};

function formatDuration(sec: number): string {
  if (!sec) return "--";
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function formatDate(d: string | null): string {
  if (!d) return "--";
  return new Date(d).toLocaleString("zh-CN", {
    timeZone: "Asia/Shanghai",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function Home() {
  // Top-level view
  const [view, setView] = useState<"upload" | "assets">("upload");

  // Upload/processing state
  const [taskId, setTaskId] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadMode, setUploadMode] = useState<"file" | "url">("file");
  const [asrProvider, setAsrProvider] = useState<AsrProvider>("whisper");
  const [urlInput, setUrlInput] = useState("");
  const [urlSubmitting, setUrlSubmitting] = useState(false);
  const [starting, setStarting] = useState(false);
  const [uploadedName, setUploadedName] = useState("");
  const [steps, setSteps] = useState<Record<string, StepState>>({});
  const [transcript, setTranscript] = useState("");
  const [chapters, setChapters] = useState<Array<Record<string, unknown>>>([]);
  const [knowledge, setKnowledge] = useState<Record<string, unknown>>({});
  const [blogMd, setBlogMd] = useState("");
  const [blogId, setBlogId] = useState<number | null>(null);
  const [error, setError] = useState("");
  const [streamStatus, setStreamStatus] = useState<"connecting" | "connected" | "reconnecting">("connecting");
  const [phase, setPhase] = useState<"upload" | "processing" | "done">("upload");
  const [activeTab, setActiveTab] = useState<TabKey>("video");
  const [elapsed, setElapsed] = useState(0);
  const elapsedRef = useRef(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const readerRef = useRef<EventSource | null>(null);
  const doneStageRef = useRef<ReturnType<typeof useStageData> | null>(null);

  // Shared stage data hooks (one for "done" phase, one for asset detail)
  const doneStage = useStageData();
  const detailStage = useStageData();

  // Keep ref in sync with latest doneStage (avoids stale closure in SSE useEffect)
  useEffect(() => {
    doneStageRef.current = doneStage;
  }, [doneStage]);

  // Asset management state
  const [videoList, setVideoList] = useState<VideoItem[]>([]);
  const [assetSearch, setAssetSearch] = useState("");
  const [assetStatusFilter, setAssetStatusFilter] = useState("");
  const [selectedVideo, setSelectedVideo] = useState<VideoDetail | null>(null);
  const [assetDetailTab, setAssetDetailTab] = useState<TabKey>("video");
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [assetMenuId, setAssetMenuId] = useState<string | null>(null);
  const [loadingAssets, setLoadingAssets] = useState(false);
  const [showPromptSettings, setShowPromptSettings] = useState(false);
  const [showAdvancedOptions, setShowAdvancedOptions] = useState(false);
  const [isDragActive, setIsDragActive] = useState(false);
  const [regenerating, setRegenerating] = useState(false);
  const [presetId, setPresetId] = useState<number | null>(null);
  const [showPresetManager, setShowPresetManager] = useState(false);
  const [regenerateDialogVideoId, setRegenerateDialogVideoId] = useState<string | null>(null);
  const [regeneratePresetId, setRegeneratePresetId] = useState<number | null>(null);

  const initSteps = useCallback(() => {
    const s: Record<string, StepState> = {};
    STEPS.forEach((k) => {
      s[k] = { status: "pending", progressPct: 0, detail: "", message: "", result: null };
    });
    setSteps(s);
  }, []);

  // Fetch video list
  const fetchVideoList = useCallback(async () => {
    setLoadingAssets(true);
    try {
      const params = new URLSearchParams();
      if (assetSearch) params.set("search", assetSearch);
      if (assetStatusFilter) params.set("status", assetStatusFilter);
      const res = await fetch(`${API_BASE}/api/videos?${params}`);
      if (res.ok) {
        setVideoList(await res.json());
      }
    } catch { /* ignore */ }
    setLoadingAssets(false);
  }, [assetSearch, assetStatusFilter]);

  useEffect(() => {
    if (!selectedVideo && (view === "assets" || (view === "upload" && phase === "upload"))) {
      const timer = window.setTimeout(() => {
        fetchVideoList();
      }, 300);
      return () => window.clearTimeout(timer);
    }
  }, [view, phase, selectedVideo, fetchVideoList]);

  // Fetch detail for a selected video
  const fetchVideoDetail = useCallback(async (videoId: string) => {
    try {
      const res = await fetch(`${API_BASE}/api/videos/${videoId}`);
      if (res.ok) {
        const detail: VideoDetail = await res.json();
        setSelectedVideo(detail);
        setAssetDetailTab("blog");
        detailStage.reset();
        if (detail.status === "completed") {
          detailStage.fetchStageData(videoId);
        }
      }
    } catch { /* ignore */ }
  }, [detailStage]);

  // Delete a video
  const handleDelete = useCallback(async (videoId: string) => {
    try {
      const res = await fetch(`${API_BASE}/api/videos/${videoId}`, { method: "DELETE" });
      if (res.ok) {
        setDeleteConfirm(null);
        if (selectedVideo?.task_id === videoId) {
          setSelectedVideo(null);
          detailStage.reset();
        }
        fetchVideoList();
      }
    } catch { /* ignore */ }
  }, [selectedVideo, fetchVideoList, detailStage]);

  // Reprocess a video
  const handleReprocess = useCallback(async (videoId: string) => {
    try {
      const res = await fetch(`${API_BASE}/api/videos/${videoId}/reprocess`, { method: "POST" });
      if (res.ok) {
        setView("upload");
        setPhase("processing");
        setError("");
        setStreamStatus("connecting");
        setTaskId(videoId);
        setSelectedVideo(null);
        detailStage.reset();
        initSteps();
        setTranscript("");
        setChapters([]);
        setKnowledge({});
        setBlogMd("");
        setBlogId(null);
        setElapsed(0);
        elapsedRef.current = 0;
        setActiveTab("blog");
        doneStage.reset();
      }
    } catch { /* ignore */ }
  }, [initSteps, doneStage, detailStage]);

  const handleStartTranscription = useCallback(async (videoId: string) => {
    setStarting(true);
    setError("");
    try {
      const res = await fetch(`${API_BASE}/api/task/${videoId}/start`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ asr_provider: asrProvider }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "启动转录失败");
      }

      setView("upload");
      setTaskId(videoId);
      setSelectedVideo(null);
      detailStage.reset();
      initSteps();
      setTranscript("");
      setChapters([]);
      setKnowledge({});
      setBlogMd("");
      setBlogId(null);
      setElapsed(0);
      elapsedRef.current = 0;
      setStreamStatus("connecting");
      setActiveTab("blog");
      doneStage.reset();
      setPhase("processing");
    } catch (err) {
      setError(err instanceof Error ? err.message : "启动转录失败");
    } finally {
      setStarting(false);
    }
  }, [asrProvider, initSteps, doneStage, detailStage]);

  // Regenerate blog only (keeps transcript/chapters/knowledge)
  const handleRegenerate = useCallback(async (videoId: string, regPresetId?: number | null) => {
    setRegenerating(true);
    setRegenerateDialogVideoId(null);
    try {
      const body: Record<string, unknown> = {};
      if (regPresetId) body.preset_id = regPresetId;
      const res = await fetch(`${API_BASE}/api/videos/${videoId}/regenerate-blog`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        setRegenerating(false);
        return;
      }

      // Monitor SSE for completion
      const es = new EventSource(`${API_BASE}/api/task/${videoId}/stream`);
      es.addEventListener("step_progress", () => {
        // Blog generation progress updates
      });
      es.addEventListener("step_result", (e) => {
        const data = JSON.parse(e.data);
        if (data.step === "generate_blog") {
          // Refresh stage data
          detailStage.fetchStageData(videoId);
        }
      });
      es.addEventListener("complete", () => {
        es.close();
        setRegenerating(false);
        // Refresh video list and detail
        fetchVideoList();
        if (selectedVideo?.task_id === videoId) {
          fetch(`${API_BASE}/api/videos/${videoId}`)
            .then((r) => r.json())
            .then((d: VideoDetail) => setSelectedVideo(d));
        }
      });
      es.addEventListener("step_error", () => {
        es.close();
        setRegenerating(false);
      });
      es.onerror = () => {
        es.close();
        setRegenerating(false);
      };
    } catch {
      setRegenerating(false);
    }
  }, [detailStage.fetchStageData, fetchVideoList, selectedVideo]);

  const handleUpload = async (file: File) => {
    setUploading(true);
    setUploadProgress(0);
    setError("");
    setTaskId(null);
    setUploadedName("");

    const formData = new FormData();
    formData.append("file", file);
    if (presetId !== null) formData.append("preset_id", String(presetId));

    const xhr = new XMLHttpRequest();
    xhr.upload.addEventListener("progress", (e) => {
      if (e.lengthComputable) {
        setUploadProgress(Math.round((e.loaded / e.total) * 100));
      }
    });

    xhr.addEventListener("load", () => {
      if (xhr.status === 200) {
        const data = JSON.parse(xhr.responseText);
        setTaskId(data.task_id);
        setUploadedName(file.name);
        setUploading(false);
        setPhase("upload");
      } else {
        setError("上传失败");
        setPhase("upload");
        setUploading(false);
      }
    });

    xhr.addEventListener("error", () => {
      setError("上传失败");
      setPhase("upload");
      setUploading(false);
    });

    // The upload endpoint only persists the file. Processing begins after the
    // user explicitly clicks "开始转录".
    xhr.open("POST", `${API_BASE}/api/upload`);
    xhr.send(formData);
  };

  const handleUrlSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const url = urlInput.trim();
    if (!url) return;

    // Basic URL validation
    try {
      new URL(url);
    } catch {
      setError("请输入有效的链接");
      return;
    }

    setUrlSubmitting(true);
    setError("");
    setTaskId(null);
    setUploadedName("");

    try {
      const res = await fetch(`${API_BASE}/api/upload/url`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          url,
          audio_only: true,
          preset_id: presetId,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        setTaskId(data.task_id);
        setUploadedName(url);
        setPhase("upload");
      } else {
        setError("链接提交失败");
        setPhase("upload");
      }
    } catch {
      setError("网络错误，请重试");
      setPhase("upload");
    } finally {
      setUrlSubmitting(false);
    }
  };

  // Timer for elapsed time during processing
  useEffect(() => {
    if (phase === "processing" && !error) {
      const startTimer = window.setTimeout(() => {
        elapsedRef.current = 0;
        setElapsed(0);
        timerRef.current = setInterval(() => {
          elapsedRef.current += 1;
          setElapsed(elapsedRef.current);
        }, 1000);
      }, 0);
      return () => {
        window.clearTimeout(startTimer);
        if (timerRef.current) {
          clearInterval(timerRef.current);
          timerRef.current = null;
        }
      };
    } else {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    }
    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [error, phase]);

  // Connect to SSE when taskId changes
  useEffect(() => {
    if (!taskId || phase !== "processing") return;

    const es = new EventSource(`${API_BASE}/api/task/${taskId}/stream`);
    readerRef.current = es;
    es.onopen = () => setStreamStatus("connected");

    const setStepStatus = (stepKey: string, status: StepState["status"]) => {
      setSteps((prev) => ({
        ...prev,
        [stepKey]: { ...prev[stepKey], status, finishedAt: status === "error" ? Date.now() : prev[stepKey]?.finishedAt },
      }));
    };

    es.addEventListener("step_start", (e) => {
      const d = JSON.parse(e.data);
      if (STEPS.includes(d.step)) {
        const idx = STEPS.indexOf(d.step);
        setSteps((prev) => {
          const next = { ...prev };
          // 新步骤已经开始，说明它前面的步骤必然已完成；
          // 如果之前因网络/事件丢失没改成 completed，这里兜底修正
          for (let i = 0; i < idx; i++) {
            const key = STEPS[i];
            if (next[key]?.status === "active") {
              next[key] = { ...next[key], status: "completed", progressPct: 100, finishedAt: Date.now() };
            }
          }
          next[d.step] = {
            ...next[d.step],
            status: "active",
            message: d.message || "",
            startedAt: next[d.step]?.startedAt ?? Date.now(),
            finishedAt: undefined,
          };
          return next;
        });
      }
    });

    es.addEventListener("step_progress", (e) => {
      const d = JSON.parse(e.data);
      if (STEPS.includes(d.step)) {
        setSteps((prev) => {
          const apiProgress = d.step === "transcribe" && typeof d.api_requests_total === "number"
            ? {
                completed: Number(d.api_requests_completed ?? 0),
                total: Number(d.api_requests_total),
                current: typeof d.api_request_current === "number" ? Number(d.api_request_current) : undefined,
              }
            : prev[d.step].apiProgress;

          return {
            ...prev,
            [d.step]: {
              ...prev[d.step],
              progressPct: Math.max(prev[d.step].progressPct || 0, Number(d.progress_pct ?? 0)),
              detail: d.detail ?? "",
              apiProgress,
            },
          };
        });
        if (d.step === "generate_blog" && d.detail) {
          setBlogMd((prev) => prev + d.detail);
        }
      }
    });

    es.addEventListener("step_result", (e) => {
      const d = JSON.parse(e.data);
      if (STEPS.includes(d.step)) {
        setSteps((prev) => {
          const apiProgress = d.step === "transcribe" && typeof d.api_requests_total === "number"
            ? {
                completed: Number(d.api_requests_completed ?? d.api_requests_total),
                total: Number(d.api_requests_total),
                current: typeof d.api_request_current === "number" ? Number(d.api_request_current) : undefined,
              }
            : prev[d.step].apiProgress;

          return {
            ...prev,
            [d.step]: {
              ...prev[d.step],
              status: "completed",
              result: d,
              progressPct: 100,
              finishedAt: Date.now(),
              detail: d.detail ?? prev[d.step].detail ?? "",
              apiProgress,
            },
          };
        });
        if (d.step === "transcribe" && d.transcript) {
          setTranscript(d.transcript);
        }
        if (d.step === "segment_chapters" && d.chapters) {
          setChapters(d.chapters);
        }
        if (d.step === "extract_knowledge" && d.knowledge) {
          setKnowledge(d.knowledge);
        }
      }
    });

    es.addEventListener("step_error", (e) => {
      const d = JSON.parse(e.data);
      setError(d.message || "处理出错");
      if (STEPS.includes(d.step)) {
        setStepStatus(d.step, "error");
      }
      setStreamStatus("connected");
      es.close();
    });

    es.addEventListener("cancelled", () => {
      es.close();
    });

    es.addEventListener("complete", (e) => {
      const d = JSON.parse(e.data);
      setBlogId(d.blog_id || null);
      setStreamStatus("connected");
      // 处理完成兜底：把所有仍活跃的步骤统一标记为完成
      setSteps((prev) => {
        const next = { ...prev };
        STEPS.forEach((key) => {
          if (next[key]?.status === "active") {
            next[key] = { ...next[key], status: "completed", progressPct: 100, finishedAt: Date.now() };
          }
        });
        return next;
      });
      setPhase("done");
      // Fetch stage data using the ref (avoids re-running this effect on every render)
      doneStageRef.current?.fetchStageData(taskId!);
      es.close();
    });

    es.addEventListener("error", () => setStreamStatus("reconnecting"));

    return () => {
      es.close();
    };
  }, [taskId, phase]);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      if (taskId) return;
      const file = e.dataTransfer.files[0];
      // Accept both video and audio files
      if (file && (file.type.startsWith("video/") || file.type.startsWith("audio/"))) {
        handleUpload(file);
      }
    },
    [handleUpload, taskId]
  );

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (taskId) return;
    const file = e.target.files?.[0];
    if (file) handleUpload(file);
  };

  const handleExportMd = async () => {
    if (!taskId || !blogId) return;
    const res = await fetch(`${API_BASE}/api/export/md`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ video_id: taskId }),
    });
    if (res.ok) {
      const data = await res.json();
      const blob = new Blob([data.content], { type: "text/markdown" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = data.filename || "blog.md";
      a.click();
    }
  };

  const handleExportSrt = async () => {
    if (!taskId) return;
    const res = await fetch(`${API_BASE}/api/export/srt`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ video_id: taskId }),
    });
    if (res.ok) {
      const data = await res.json();
      const blob = new Blob([data.content], { type: "text/plain" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = data.filename || "transcript.srt";
      a.click();
    }
  };

  const handleExportTxt = async () => {
    if (!taskId) return;
    const res = await fetch(`${API_BASE}/api/export/txt`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ video_id: taskId }),
    });
    if (res.ok) {
      const data = await res.json();
      const blob = new Blob([data.content], { type: "text/plain" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = data.filename || "transcript.txt";
      a.click();
    }
  };

  const handleExportJson = async (stage: string) => {
    if (!taskId) return;
    const res = await fetch(`${API_BASE}/api/export/json`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ video_id: taskId, stage }),
    });
    if (res.ok) {
      const data = await res.json();
      const blob = new Blob([data.content], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = data.filename || `${stage}.json`;
      a.click();
    }
  };

  const handleDownloadAudio = () => {
    if (!doneStage.audioUrl) return;
    const a = document.createElement("a");
    a.href = doneStage.audioUrl;
    a.download = "audio.wav";
    a.click();
  };

  const handleCancel = async () => {
    if (!taskId) return;
    try {
      await fetch(`${API_BASE}/api/task/${taskId}/cancel`, { method: "POST" });
    } catch { /* ignore */ }
    if (readerRef.current) {
      readerRef.current.close();
      readerRef.current = null;
    }
    setPhase("upload");
    setTaskId(null);
    setUploadedName("");
    setError("");
    setStreamStatus("connecting");
  };

  const activeStep = STEPS.find((k) => steps[k]?.status === "active");

  const completedSteps = STEPS.filter((k) => steps[k]?.status === "completed").length;
  const overallPct = Math.round(
    (completedSteps * 100 + (activeStep ? (steps[activeStep]?.progressPct || 0) : 0)) / STEPS.length
  );

  // ===== ASSET LIST VIEW =====
  const renderAssetList = () => (
    <div className="content-shell">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="page-heading">资产管理</h2>
          <p className="page-description">
            查找、继续处理和管理你沉淀的文本资产。
          </p>
        </div>
        <button
          onClick={() => {
            setView("upload");
            setPhase("upload");
            setTaskId(null);
            setUploadedName("");
            setUrlInput("");
            setError("");
          }}
          className="btn-primary"
        >
          <span aria-hidden="true">＋</span> 新建内容
        </button>
      </div>

      {error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-600 text-sm">
          {error}
        </div>
      )}

      {/* Search & Filter */}
      <div className="library-toolbar">
        <input
          type="text"
          placeholder="按标题或文件名搜索..."
          value={assetSearch}
          onChange={(e) => setAssetSearch(e.target.value)}
          className="control-field"
        />
        <select
          value={assetStatusFilter}
          onChange={(e) => setAssetStatusFilter(e.target.value)}
          className="control-field"
        >
          <option value="">全部状态</option>
          <option value="completed">已完成</option>
          <option value="failed">失败</option>
          <option value="cancelled">已终止</option>
          <option value="pending">待启动</option>
        </select>
        <button
          onClick={fetchVideoList}
          className="btn-secondary px-3"
          title="刷新资产列表"
          aria-label="刷新资产列表"
        >
          ↻
        </button>
      </div>

      {/* Video List */}
      {loadingAssets ? (
        <div className="surface-card p-8 text-center text-zinc-500">正在加载资产…</div>
      ) : videoList.length === 0 ? (
        <div className="empty-state">
          <div className="empty-icon" aria-hidden="true">＋</div>
          <p className="font-semibold text-zinc-800">还没有文本资产</p>
          <p className="mt-1 text-sm text-zinc-500">添加一个视频、音频或链接，从第一篇文章开始。</p>
        </div>
      ) : (
        <div className="surface-card library-list">
          {videoList.map((v) => (
            <div
              key={v.task_id}
              className="library-row"
            >
              <button
                type="button"
                onClick={() => fetchVideoDetail(v.task_id)}
                className="min-w-0 flex-1 text-left"
              >
                <div className="asset-row-content">
                  <div className="min-w-0">
                    <h3 className="truncate text-sm font-semibold text-zinc-800">
                      {v.title || v.filename}
                    </h3>
                    <div className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-zinc-500">
                      <span>{SOURCE_LABELS[v.source_type] || v.source_type}</span>
                      <span className="max-w-64 truncate">{v.filename}</span>
                      <span>原片 {formatDuration(v.duration)}</span>
                      {v.processing_duration != null && (
                        <span>处理耗时 {formatDuration(v.processing_duration)}</span>
                      )}
                      <span>{formatDate(v.created_at)}</span>
                      {v.has_blog && <span className="text-zinc-700">已有文章</span>}
                    </div>
                  </div>
                </div>
              </button>

              <div className="asset-row-actions">
                <div className="asset-primary-action">
                  <span className="asset-status">
                    <span className={`status-dot ${STATUS_DOT_COLORS[v.status] || "bg-zinc-400"}`} />
                    {STATUS_LABELS[v.status] || v.status}
                  </span>
                  <button
                    type="button"
                    onClick={() => fetchVideoDetail(v.task_id)}
                    className="btn-secondary asset-detail-button"
                  >
                    详情
                  </button>
                </div>
                <button
                  type="button"
                  onClick={() => setAssetMenuId((current) => current === v.task_id ? null : v.task_id)}
                  className="btn-ghost asset-more-button text-base leading-none"
                  aria-label={`更多操作：${v.title || v.filename}`}
                  aria-expanded={assetMenuId === v.task_id}
                >
                  ···
                </button>
                {assetMenuId === v.task_id && (
                  <div className="action-menu">
                  {v.status === "pending" ? (
                    <button
                      onClick={() => { setAssetMenuId(null); handleStartTranscription(v.task_id); }}
                      disabled={starting}
                    >
                      开始转录
                    </button>
                  ) : v.status === "completed" || v.status === "failed" || v.status === "cancelled" ? (
                    <button
                      onClick={() => { setAssetMenuId(null); handleReprocess(v.task_id); }}
                    >
                      重新处理
                    </button>
                  ) : null}
                  <button
                    onClick={() => { setAssetMenuId(null); setDeleteConfirm(v.task_id); }}
                    className="is-danger"
                  >
                    删除
                  </button>
                </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );

  // ===== ASSET DETAIL VIEW =====
  const renderAssetDetail = () => {
    if (!selectedVideo) return null;
    const v = selectedVideo;

    // Export handlers for detail view (use video task_id as id)
    const detailExportHandlers = v.status === "completed" ? {
      onExportMd: async () => {
        const res = await fetch(`${API_BASE}/api/export/md`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ video_id: v.task_id }),
        });
        if (res.ok) {
          const data = await res.json();
          const blob = new Blob([data.content], { type: "text/markdown" });
          const url = URL.createObjectURL(blob);
          const a = document.createElement("a");
          a.href = url;
          a.download = data.filename || "blog.md";
          a.click();
        }
      },
      onExportTxt: async () => {
        const res = await fetch(`${API_BASE}/api/export/txt`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ video_id: v.task_id }),
        });
        if (res.ok) {
          const data = await res.json();
          const blob = new Blob([data.content], { type: "text/plain" });
          const url = URL.createObjectURL(blob);
          const a = document.createElement("a");
          a.href = url;
          a.download = data.filename || "transcript.txt";
          a.click();
        }
      },
      onExportSrt: async () => {
        const res = await fetch(`${API_BASE}/api/export/srt`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ video_id: v.task_id }),
        });
        if (res.ok) {
          const data = await res.json();
          const blob = new Blob([data.content], { type: "text/plain" });
          const url = URL.createObjectURL(blob);
          const a = document.createElement("a");
          a.href = url;
          a.download = data.filename || "transcript.srt";
          a.click();
        }
      },
      onExportJson: async (stage: string) => {
        const res = await fetch(`${API_BASE}/api/export/json`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ video_id: v.task_id, stage }),
        });
        if (res.ok) {
          const data = await res.json();
          const blob = new Blob([data.content], { type: "application/json" });
          const url = URL.createObjectURL(blob);
          const a = document.createElement("a");
          a.href = url;
          a.download = data.filename || `${stage}.json`;
          a.click();
        }
      },
      onDownloadAudio: () => {
        if (!detailStage.audioUrl) return;
        const a = document.createElement("a");
        a.href = detailStage.audioUrl;
        a.download = "audio.wav";
        a.click();
      },
    } : undefined;

    return (
      <div className="content-shell max-w-5xl!">
        {error && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-600 text-sm">
            {error}
          </div>
        )}
        <div className="flex items-center gap-3 mb-7">
          <button
            onClick={() => { setSelectedVideo(null); detailStage.reset(); }}
            className="btn-secondary"
          >
            ← 返回
          </button>
          <div className="flex-1 min-w-0">
            <h2 className="page-heading truncate text-[26px]!">{v.title || v.filename}</h2>
            <div className="flex items-center gap-3 text-xs text-zinc-500 mt-1">
              <span className="flex items-center gap-1.5">
                <span className={`status-dot ${STATUS_DOT_COLORS[v.status] || "bg-zinc-400"}`} />
                {STATUS_LABELS[v.status] || v.status}
              </span>
              <span>{v.filename}</span>
              <span>时长 {formatDuration(v.duration)}</span>
              {v.processing_duration != null && (
                <span>处理耗时 {formatDuration(v.processing_duration)}</span>
              )}
              <span>{formatDate(v.created_at)}</span>
            </div>
          </div>
          <div className="flex gap-2 shrink-0">
            {v.status === "pending" ? (
              <button
                onClick={() => handleStartTranscription(v.task_id)}
                disabled={starting}
                className="btn-primary min-h-9 px-3 text-xs"
              >
                {starting ? "启动中..." : "开始转录"}
              </button>
            ) : v.status === "completed" || v.status === "failed" || v.status === "cancelled" ? (
              <button
                onClick={() => handleReprocess(v.task_id)}
                className="btn-secondary min-h-9 px-3 text-xs text-amber-600"
              >
                重新处理
              </button>
            ) : null}
            <button
              onClick={() => setDeleteConfirm(v.task_id)}
              className="btn-danger min-h-9 px-3 text-xs"
            >
              删除
            </button>
          </div>
        </div>

        {/* Stats */}
        <div className="mb-6 grid grid-cols-2 border-y border-zinc-200 sm:grid-cols-4">
          {[
            { label: "转录片段", value: v.transcript_segments },
            { label: "章节数", value: v.chapters_count },
            { label: "知识点", value: v.concepts_count },
            { label: "文章", value: v.blog ? "有" : "无" },
          ].map((s) => (
            <div key={s.label} className="border-zinc-200 p-4 text-center sm:border-r sm:last:border-r-0">
              <div className="text-lg font-bold text-zinc-800">{s.value}</div>
              <div className="text-xs text-zinc-500">{s.label}</div>
            </div>
          ))}
        </div>

        {/* Unified stage viewer with export */}
        {v.status !== "completed" ? (
          <div className="text-center py-20 text-zinc-400">
            <div className="text-4xl mb-4">⏳</div>
            <p className="text-lg">视频正在处理中...</p>
            <p className="text-sm mt-2">状态: {STATUS_LABELS[v.status] || v.status}</p>
          </div>
        ) : (
          <StageViewer
            videoId={v.task_id}
            filename={v.filename}
            duration={v.duration}
            stageData={detailStage.stageData}
            audioUrl={detailStage.audioUrl}
            activeTab={assetDetailTab}
            onTabChange={setAssetDetailTab}
            showExport={true}
            blogMarkdown={v.blog?.markdown}
            blogId={v.blog?.id}
            exportHandlers={detailExportHandlers}
            onRegenerate={v.status === "completed" ? () => { setRegenerateDialogVideoId(v.task_id); setRegeneratePresetId(presetId); } : undefined}
            regenerating={regenerating}
          />
        )}
      </div>
    );
  };

  return (
    <div className="app-shell h-full flex flex-col">
      {/* Header */}
      <header className="app-header">
        <div className="brand-lockup">
          <span className="brand-mark" aria-hidden="true">V</span>
          <div className="brand-copy">
            <h1 className="brand-title">Video2Knowledge</h1>
          </div>
        </div>
        <nav className="app-nav" aria-label="主导航">
          <button
            onClick={() => {
              setView("upload");
              if (phase === "done") {
                setPhase("upload");
                setTaskId(null);
                setUploadedName("");
                setUrlInput("");
                setError("");
              }
            }}
            className={`nav-pill ${view === "upload" ? "is-active" : ""}`}
          >
            新建内容
          </button>
          <button
            onClick={() => { setView("assets"); setSelectedVideo(null); detailStage.reset(); }}
            className={`nav-pill ${view === "assets" ? "is-active" : ""}`}
          >
            资产管理
          </button>
        </nav>
        <button
          onClick={() => setShowPromptSettings(true)}
          className="icon-button"
          title="提示词设置"
          aria-label="打开提示词设置"
        >
          <svg className="w-5 h-5 text-zinc-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.324.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 011.37.49l1.296 2.247a1.125 1.125 0 01-.26 1.431l-1.003.827c-.293.24-.438.613-.431.992a6.759 6.759 0 010 .255c-.007.378.138.75.43.99l1.005.828c.424.35.534.954.26 1.43l-1.298 2.247a1.125 1.125 0 01-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.57 6.57 0 01-.22.128c-.331.183-.581.495-.644.869l-.213 1.28c-.09.543-.56.941-1.11.941h-2.594c-.55 0-1.02-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 01-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 01-1.369-.49l-1.297-2.247a1.125 1.125 0 01.26-1.431l1.004-.827c.292-.24.437-.613.43-.992a6.932 6.932 0 010-.255c.007-.378-.138-.75-.43-.99l-1.004-.828a1.125 1.125 0 01-.26-1.43l1.297-2.247a1.125 1.125 0 011.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.087.22-.128.332-.183.582-.495.644-.869l.214-1.281z" />
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
        </button>
      </header>

      {/* Prompt Settings Modal */}
      <PromptSettings open={showPromptSettings} onClose={() => setShowPromptSettings(false)} />
      <PresetManager
        open={showPresetManager}
        onClose={() => setShowPresetManager(false)}
        onPresetsChanged={() => window.dispatchEvent(new Event("presets-refresh"))}
      />

      {/* Regenerate dialog with preset selection */}
      {regenerateDialogVideoId && (
        <div className="modal-backdrop" onClick={() => setRegenerateDialogVideoId(null)}>
          <div className="modal-panel" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-labelledby="regenerate-title">
            <h3 id="regenerate-title" className="text-lg font-semibold mb-4">重新生成文章</h3>
            <div className="mb-4">
              <label className="block text-sm font-medium text-zinc-700 mb-2">选择提示词预设</label>
              <PresetSelector
                value={regeneratePresetId}
                onChange={setRegeneratePresetId}
                onManageClick={() => setShowPresetManager(true)}
              />
            </div>
            <p className="text-xs text-zinc-500 mb-4">
              将使用所选文章风格重新生成文章，并保留已有的转录、章节和知识数据。
            </p>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setRegenerateDialogVideoId(null)}
                className="btn-secondary"
              >
                取消
              </button>
              <button
                onClick={() => handleRegenerate(regenerateDialogVideoId, regeneratePresetId)}
                className="btn-primary"
              >
                确认生成
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete confirmation modal */}
      {deleteConfirm && (
        <div className="modal-backdrop" onClick={() => setDeleteConfirm(null)}>
          <div className="modal-panel" onClick={(e) => e.stopPropagation()} role="alertdialog" aria-modal="true" aria-labelledby="delete-title">
            <h3 id="delete-title" className="text-lg font-semibold mb-2">确认删除</h3>
            <p className="text-sm text-zinc-500 mb-1">
              此操作将永久删除以下内容：
            </p>
            <ul className="text-sm text-zinc-600 list-disc list-inside mb-4">
              <li>原始上传文件（视频/音频/链接缓存）</li>
              <li>提取的音频</li>
              <li>转录文本、章节、知识点</li>
              <li>生成的文章</li>
            </ul>
            <p className="text-xs text-zinc-400 mb-4 font-mono">{deleteConfirm}</p>
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setDeleteConfirm(null)}
                className="btn-secondary"
              >
                取消
              </button>
              <button
                onClick={() => handleDelete(deleteConfirm)}
                className="btn-danger bg-red-600! text-white! hover:bg-red-700!"
              >
                删除
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Main Content */}
      <div className="flex-1 flex overflow-hidden">
        {/* Completed-result sidebar; processing has its own three-column workspace. */}
        {view === "upload" && phase === "done" && (
          <aside className="stage-sidebar">
            <h2 className="mb-5 text-sm font-semibold text-zinc-800">
              处理流程
            </h2>
            <ul className="relative">
              {/* Vertical connector line */}
              <div className="absolute left-[15px] top-3 bottom-3 w-px bg-zinc-200" />
              <div className="space-y-1">
                {STEPS.map((key, idx) => {
                  const s = steps[key];
                  const isActive = s?.status === "active";
                  const isCompleted = s?.status === "completed";
                  const isError = s?.status === "error";

                  return (
                    <li
                      key={key}
                      className={`relative py-2.5 pr-3 pl-10 transition-colors duration-200 ${
                        isActive ? "border-l-2 border-blue-600 bg-white" : "border-l-2 border-transparent"
                      }`}
                    >
                      {/* Step indicator circle */}
                      <div className="absolute left-0 top-2.5 flex items-center justify-center">
                        <div
                          className={`flex h-[30px] w-[30px] items-center justify-center rounded-full border text-xs font-bold transition-colors duration-200 ${
                            isCompleted
                              ? "border-zinc-300 bg-white text-emerald-700"
                              : isActive
                                ? "border-blue-600 bg-white text-blue-600"
                                : isError
                                  ? "border-red-500 bg-white text-red-600"
                                  : "border-zinc-300 bg-white text-zinc-400"
                          }`}
                        >
                          {isCompleted ? (
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                            </svg>
                          ) : isActive ? (
                            <span className="h-2 w-2 rounded-full bg-blue-600" />
                          ) : isError ? (
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                            </svg>
                          ) : (
                            <span>{idx + 1}</span>
                          )}
                        </div>
                      </div>

                      {/* Step content */}
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className={`text-sm font-medium truncate ${
                            isActive ? "text-blue-700"
                            : isCompleted ? "text-zinc-500"
                            : isError ? "text-red-600"
                            : "text-zinc-400"
                          }`}>
                            {STEP_LABELS[key]}
                          </span>
                          {isCompleted && (
                            <span className="ml-auto text-xs font-mono font-semibold text-emerald-600 tabular-nums">
                              ✓
                            </span>
                          )}
                        </div>

                        {/* Active step detail */}
                        {isActive && s.message && (
                          <p className="text-xs text-zinc-500 mt-1 truncate">{s.message}</p>
                        )}

                        {/* Completed step detail */}
                        {isCompleted && s.message && (
                          <p className="text-xs text-emerald-600/70 mt-0.5">{s.message}</p>
                        )}
                      </div>
                    </li>
                  );
                })}
              </div>
            </ul>
          </aside>
        )}

        {/* Content Area */}
        <main className={`app-main ${view === "upload" && phase === "processing" ? "app-main--processing" : ""}`}>
          {/* ASSETS VIEW */}
          {view === "assets" && !selectedVideo && renderAssetList()}
          {view === "assets" && selectedVideo && renderAssetDetail()}

          {/* UPLOAD VIEW */}
          {view === "upload" && phase === "upload" && (
            <div className="create-page">
              <div className="create-intro">
                <h2 className="hero-title">把视频整理成一篇文本资产</h2>
                <p className="hero-description">
                  上传视频、音频或链接，获得结构清晰、可以继续编辑的文本资产。
                </p>
                <ul className="capability-list" aria-label="核心能力">
                  <li>准确转录语音与时间信息</li>
                  <li>梳理章节、概念与方法</li>
                  <li>生成可编辑、可导出的文章</li>
                </ul>
              </div>

              <section className="upload-panel" aria-label="新建内容">
                <div className="workspace-inner">
                  <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                    <div className="text-left">
                      <p className="text-sm font-semibold text-zinc-800">添加素材</p>
                      <p className="mt-1 text-xs text-zinc-500">视频、音频或媒体链接均可开始</p>
                    </div>
                    <div className="source-switch" aria-label="素材类型">
                      <button
                        type="button"
                        onClick={() => { setUploadMode("file"); setError(""); }}
                        disabled={Boolean(taskId)}
                        className={uploadMode === "file" ? "is-active" : ""}
                      >
                        本地文件
                      </button>
                      <button
                        type="button"
                        onClick={() => { setUploadMode("url"); setError(""); }}
                        disabled={Boolean(taskId)}
                        className={uploadMode === "url" ? "is-active" : ""}
                      >
                        媒体链接
                      </button>
                    </div>
                  </div>

                  {uploadMode === "file" ? (
                    <div
                      onDrop={(e) => { setIsDragActive(false); handleDrop(e); }}
                      onDragEnter={(e) => { e.preventDefault(); setIsDragActive(true); }}
                      onDragLeave={(e) => { e.preventDefault(); setIsDragActive(false); }}
                      onDragOver={(e) => e.preventDefault()}
                      onClick={() => {
                        if (!taskId) fileInputRef.current?.click();
                      }}
                      className={`upload-dropzone ${isDragActive ? "is-dragging" : ""} ${taskId ? "is-complete" : ""}`}
                    >
                      {uploading ? (
                        <div className="w-full max-w-md">
                          <div className="progress-track mb-4">
                            <div className="progress-fill" style={{ width: `${uploadProgress}%` }} />
                          </div>
                          <p className="font-medium text-zinc-700">正在上传 {uploadProgress}%</p>
                          <p className="mt-1 text-xs text-zinc-400">请保持页面开启</p>
                        </div>
                      ) : taskId ? (
                        <div>
                          <div className="upload-orb bg-emerald-50! text-emerald-600!">✓</div>
                          <p className="font-semibold text-emerald-700">素材已准备好</p>
                          <p className="mt-1 max-w-md break-all text-sm text-zinc-500">{uploadedName}</p>
                        </div>
                      ) : (
                        <div>
                          <div className="upload-orb" aria-hidden="true">↑</div>
                          <p className="font-semibold text-zinc-800">拖入视频或音频文件</p>
                          <p className="mt-1.5 text-sm text-zinc-500">或点击这里从电脑中选择</p>
                          <p className="mt-4 text-xs text-zinc-400">
                            MP4、MOV、AVI、MKV、MP3、WAV、M4A、AAC、FLAC
                          </p>
                        </div>
                      )}
                      <input
                        ref={fileInputRef}
                        type="file"
                        accept="video/*,audio/*"
                        className="hidden"
                        onChange={handleFileSelect}
                        disabled={Boolean(taskId)}
                        aria-label="选择视频或音频文件"
                      />
                    </div>
                  ) : (
                    <form onSubmit={handleUrlSubmit}>
                      <div className="upload-dropzone min-h-[190px]! text-left! place-items-stretch!">
                        <div className="my-auto w-full">
                          <label className="field-label" htmlFor="media-url">媒体链接</label>
                          <input
                            id="media-url"
                            type="url"
                            placeholder="粘贴 YouTube、Bilibili、抖音或播客链接"
                            value={urlInput}
                            onChange={(e) => setUrlInput(e.target.value)}
                            className="control-field"
                            disabled={Boolean(taskId)}
                            autoFocus
                          />
                          <p className="mt-3 text-xs leading-5 text-zinc-400">
                            系统会自动提取音频轨道。部分需要登录的平台可能无法直接获取。
                          </p>
                        </div>
                      </div>
                      {!taskId && (
                        <div className="mt-4 flex justify-end">
                          <button
                            type="submit"
                            disabled={urlSubmitting || !urlInput.trim()}
                            className="btn-primary min-w-32"
                          >
                            {urlSubmitting ? "正在解析…" : "解析链接 →"}
                          </button>
                        </div>
                      )}
                    </form>
                  )}

                  {showAdvancedOptions && (
                    <div className="advanced-panel">
                      <div className="advanced-grid">
                        <div>
                          <span className="field-label">文章风格</span>
                          <PresetSelector
                            value={presetId}
                            onChange={setPresetId}
                            onManageClick={() => setShowPresetManager(true)}
                            compact
                          />
                        </div>
                        <div>
                          <span className="field-label">转录方式</span>
                          <div className="source-switch">
                            <button
                              type="button"
                              onClick={() => setAsrProvider("whisper")}
                              className={asrProvider === "whisper" ? "is-active" : ""}
                            >
                              Whisper
                            </button>
                            <button
                              type="button"
                              onClick={() => setAsrProvider("mimo")}
                              className={asrProvider === "mimo" ? "is-active" : ""}
                            >
                              MIMO-ASR
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                  <div className="option-strip">
                    <div className="option-chips">
                      <button
                        type="button"
                        className={`settings-trigger ${showAdvancedOptions ? "is-active" : ""}`}
                        onClick={() => setShowAdvancedOptions((current) => !current)}
                        aria-expanded={showAdvancedOptions}
                        aria-label={showAdvancedOptions ? "收起设置" : "打开设置"}
                        title={showAdvancedOptions ? "收起设置" : "设置"}
                      >
                        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.7} aria-hidden="true">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.324.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 011.37.49l1.296 2.247a1.125 1.125 0 01-.26 1.431l-1.003.827c-.293.24-.438.613-.431.992a6.759 6.759 0 010 .255c-.007.378.138.75.43.99l1.005.828c.424.35.534.954.26 1.43l-1.298 2.247a1.125 1.125 0 01-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.57 6.57 0 01-.22.128c-.331.183-.581.495-.644.869l-.213 1.28c-.09.543-.56.941-1.11.941h-2.594c-.55 0-1.02-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 01-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 01-1.369-.49l-1.297-2.247a1.125 1.125 0 01.26-1.431l1.004-.827c.292-.24.437-.613.43-.992a6.932 6.932 0 010-.255c.007-.378-.138-.75-.43-.99l-1.004-.828a1.125 1.125 0 01-.26-1.43l1.297-2.247a1.125 1.125 0 011.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.087.22-.128.332-.183.582-.495.644-.869l.214-1.281z" />
                          <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                        </svg>
                      </button>
                      <span className="option-chip">{asrProvider === "mimo" ? "MIMO-ASR" : "Whisper"}</span>
                      <span className="option-chip">中文优先</span>
                    </div>
                    {taskId && (
                      <button
                        type="button"
                        onClick={() => handleStartTranscription(taskId)}
                        disabled={starting}
                        className="btn-primary min-w-36"
                      >
                        {starting ? "正在启动…" : "开始整理"}
                      </button>
                    )}
                  </div>

                  {error && (
                    <div className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-left text-sm text-red-600" role="alert">
                      {error}
                    </div>
                  )}
                </div>
              </section>

              {videoList.length > 0 && (
                <section className="recent-section animate-fade-in-up" aria-labelledby="recent-tasks-title">
                  <div className="mb-3 flex items-center justify-between">
                    <div>
                      <h3 id="recent-tasks-title" className="text-sm font-semibold text-zinc-800">最近内容</h3>
                      <p className="mt-1 text-xs text-zinc-500">继续上次的整理工作</p>
                    </div>
                    <button type="button" onClick={() => setView("assets")} className="btn-ghost min-h-8 px-3 text-xs">
                      查看全部 →
                    </button>
                  </div>
                  <div className="recent-list">
                    {videoList.slice(0, 3).map((video) => (
                      <button
                        key={video.task_id}
                        type="button"
                        onClick={() => { setView("assets"); fetchVideoDetail(video.task_id); }}
                        className="recent-row w-full min-w-0 text-left"
                      >
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold text-zinc-800">{video.title || video.filename}</p>
                          <p className="mt-1.5 text-xs text-zinc-500">
                            {SOURCE_LABELS[video.source_type] || video.source_type} · {formatDate(video.created_at)}
                          </p>
                        </div>
                        <span className="flex items-center gap-2 text-xs text-zinc-500">
                          <span className={`status-dot ${STATUS_DOT_COLORS[video.status] || "bg-zinc-400"}`} />
                          {STATUS_LABELS[video.status] || video.status}
                        </span>
                      </button>
                    ))}
                  </div>
                </section>
              )}
            </div>
          )}

          {view === "upload" && phase === "processing" && (
            <ProcessingWorkspace
              uploadedName={uploadedName}
              steps={steps}
              transcript={transcript}
              chapters={chapters}
              knowledge={knowledge}
              blogMarkdown={blogMd}
              elapsed={elapsed}
              overallPct={overallPct}
              completedSteps={completedSteps}
              error={error}
              streamStatus={streamStatus}
              onCancel={handleCancel}
            />
          )}

          {view === "upload" && phase === "done" && taskId && (
            <div className="content-shell max-w-5xl!">
              <div className="flex items-center justify-between mb-6">
                <div>
                  <h2 className="text-xl font-semibold mb-1">处理完成</h2>
                  <p className="text-sm text-zinc-500">
                    查看并导出各阶段的结果
                  </p>
                </div>
                <button
                  onClick={() => {
                    setPhase("upload");
                    setTaskId(null);
                    setUploadedName("");
                    setUrlInput("");
                    setError("");
                    doneStage.reset();
                  }}
                  className="btn-secondary"
                >
                  新建内容
                </button>
              </div>

              <StageViewer
                videoId={taskId}
                stageData={doneStage.stageData}
                audioUrl={doneStage.audioUrl}
                activeTab={activeTab}
                onTabChange={setActiveTab}
                showExport
                blogMarkdown={blogMd}
                blogId={blogId}
                exportHandlers={{
                  onExportMd: handleExportMd,
                  onExportTxt: handleExportTxt,
                  onExportSrt: handleExportSrt,
                  onExportJson: handleExportJson,
                  onDownloadAudio: handleDownloadAudio,
                }}
              />
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
