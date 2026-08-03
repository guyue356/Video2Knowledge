"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import MarkdownRenderer from "./MarkdownRenderer";

const STAGE_KEYS = [
  "extract_audio",
  "transcribe",
  "segment_chapters",
  "extract_knowledge",
  "generate_blog",
] as const;

type StageKey = (typeof STAGE_KEYS)[number];
type StageStatus = "pending" | "active" | "completed" | "error";
type MobilePanel = "flow" | "output" | "progress";

const STAGE_LABELS: Record<StageKey, string> = {
  extract_audio: "音频提取",
  transcribe: "语音转录",
  segment_chapters: "章节划分",
  extract_knowledge: "知识提取",
  generate_blog: "文章生成",
};

const STAGE_DESCRIPTIONS: Record<StageKey, string> = {
  extract_audio: "提取并标准化音轨，为后续识别准备输入",
  transcribe: "识别语音内容并整理为可阅读文本",
  segment_chapters: "理解内容结构并生成章节时间轴",
  extract_knowledge: "提炼概念、方法、工具和关键洞察",
  generate_blog: "把阶段结果组织为可发布的技术文章",
};

const KNOWLEDGE_LABELS: Record<string, string> = {
  concepts: "核心概念",
  frameworks: "框架",
  methods: "方法",
  tools: "工具",
  papers: "论文",
  code_examples: "代码示例",
  insights: "洞察",
};

export interface ProcessingStepState {
  status: StageStatus;
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

interface ProcessingWorkspaceProps {
  uploadedName: string;
  steps: Record<string, ProcessingStepState>;
  transcript: string;
  chapters: Array<Record<string, unknown>>;
  knowledge: Record<string, unknown>;
  blogMarkdown: string;
  elapsed: number;
  overallPct: number;
  completedSteps: number;
  error: string;
  streamStatus: "connecting" | "connected" | "reconnecting";
  onCancel: () => void;
}

function clampProgress(value: number | undefined) {
  return Math.max(0, Math.min(100, Number(value) || 0));
}

function formatElapsed(sec: number) {
  const hours = Math.floor(sec / 3600);
  const minutes = Math.floor((sec % 3600) / 60);
  const seconds = sec % 60;
  if (hours > 0) {
    return `${hours.toString().padStart(2, "0")}:${minutes.toString().padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`;
  }
  return `${minutes.toString().padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`;
}

function StatusIcon({ status, index }: { status: StageStatus; index: number }) {
  if (status === "active") {
    return <span className="processing-spinner" aria-hidden="true" />;
  }
  if (status === "completed") {
    return (
      <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path d="M5 12.5 9.2 17 19 7" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  }
  if (status === "error") {
    return (
      <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path d="m7 7 10 10M17 7 7 17" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
      </svg>
    );
  }
  return <span aria-hidden="true">{index + 1}</span>;
}

function StageStatusBadge({ status }: { status: StageStatus }) {
  const labels: Record<StageStatus, string> = {
    pending: "等待中",
    active: "处理中",
    completed: "已完成",
    error: "失败",
  };
  return <span className={`processing-status-badge is-${status}`}>{labels[status]}</span>;
}

export default function ProcessingWorkspace({
  uploadedName,
  steps,
  transcript,
  chapters,
  knowledge,
  blogMarkdown,
  elapsed,
  overallPct,
  completedSteps,
  error,
  streamStatus,
  onCancel,
}: ProcessingWorkspaceProps) {
  const activeStage = STAGE_KEYS.find((key) => steps[key]?.status === "active");
  const errorStage = STAGE_KEYS.find((key) => steps[key]?.status === "error");
  const lastCompletedStage = [...STAGE_KEYS].reverse().find((key) => steps[key]?.status === "completed");
  const latestStage = activeStage ?? errorStage ?? lastCompletedStage ?? STAGE_KEYS[0];
  const [selectedStage, setSelectedStage] = useState<StageKey>(latestStage);
  const [followLatest, setFollowLatest] = useState(true);
  const [autoScroll, setAutoScroll] = useState(true);
  const [mobilePanel, setMobilePanel] = useState<MobilePanel>("output");
  const outputScrollRef = useRef<HTMLDivElement>(null);

  const viewingStage = followLatest ? latestStage : selectedStage;
  const viewingIndex = STAGE_KEYS.indexOf(viewingStage);
  const viewingStep = steps[viewingStage] ?? {
    status: "pending" as const,
    progressPct: 0,
    detail: "",
    message: "",
    result: null,
  };
  const viewingProgress = clampProgress(viewingStep.progressPct);

  const outputVersion = useMemo(() => {
    if (viewingStage === "transcribe") return transcript.length;
    if (viewingStage === "segment_chapters") return chapters.length;
    if (viewingStage === "extract_knowledge") return JSON.stringify(knowledge).length;
    if (viewingStage === "generate_blog") return blogMarkdown.length;
    return `${viewingStep.progressPct}-${viewingStep.detail}`;
  }, [blogMarkdown, chapters.length, knowledge, transcript.length, viewingStage, viewingStep.detail, viewingStep.progressPct]);

  useEffect(() => {
    const container = outputScrollRef.current;
    if (!container || !autoScroll || viewingStage !== latestStage) return;
    const frame = window.requestAnimationFrame(() => {
      container.scrollTop = container.scrollHeight;
    });
    return () => window.cancelAnimationFrame(frame);
  }, [autoScroll, latestStage, outputVersion, viewingStage]);

  useEffect(() => {
    const container = outputScrollRef.current;
    if (!container || viewingStage === latestStage) return;
    container.scrollTop = 0;
  }, [latestStage, viewingStage]);

  const canViewStage = (stage: StageKey) => {
    const status = steps[stage]?.status;
    return status === "active" || status === "completed" || status === "error" || stage === viewingStage;
  };

  const selectStage = (stage: StageKey) => {
    if (!canViewStage(stage)) return;
    setSelectedStage(stage);
    setFollowLatest(stage === latestStage);
    setAutoScroll(true);
  };

  const showLatest = () => {
    setSelectedStage(latestStage);
    setFollowLatest(true);
    setAutoScroll(true);
    setMobilePanel("output");
  };

  const movePage = (direction: -1 | 1) => {
    const targetIndex = viewingIndex + direction;
    if (targetIndex < 0 || targetIndex >= STAGE_KEYS.length) return;
    const target = STAGE_KEYS[targetIndex];
    if (canViewStage(target)) selectStage(target);
  };

  const onOutputScroll = () => {
    const container = outputScrollRef.current;
    if (!container || viewingStage !== latestStage) return;
    const distanceToBottom = container.scrollHeight - container.scrollTop - container.clientHeight;
    setAutoScroll(distanceToBottom <= 80);
  };

  const renderEmptyState = (title: string, description: string) => (
    <div className="processing-output-empty">
      <div className="processing-output-orb" aria-hidden="true">
        <span />
        <span />
        <span />
      </div>
      <h4>{title}</h4>
      <p>{description}</p>
      {viewingStep.status === "active" && (
        <div className="processing-live-line">
          <span className="processing-live-dot" />
          {viewingStep.detail || viewingStep.message || "正在处理当前阶段…"}
        </div>
      )}
    </div>
  );

  const renderStageOutput = () => {
    if (viewingStage === "extract_audio") {
      return (
        <div className="audio-stage-output">
          <div className={`audio-wave ${viewingStep.status === "active" ? "is-playing" : ""}`} aria-hidden="true">
            {Array.from({ length: 18 }).map((_, index) => (
              <span key={index} style={{ animationDelay: `${(index % 6) * 90}ms` }} />
            ))}
          </div>
          <div className="audio-stage-copy">
            <span className="output-kicker">音轨准备</span>
            <h4>{viewingStep.status === "completed" ? "音频已经准备就绪" : "正在解析媒体与标准化音频"}</h4>
            <p>{viewingStep.detail || viewingStep.message || STAGE_DESCRIPTIONS.extract_audio}</p>
          </div>
          <div className="audio-stage-metrics">
            <span>16 kHz</span>
            <span>Mono WAV</span>
            <span>{viewingStep.status === "completed" ? "可供转录" : `${viewingProgress}%`}</span>
          </div>
        </div>
      );
    }

    if (viewingStage === "transcribe") {
      if (!transcript) {
        return renderEmptyState("正在倾听视频内容", "转录文本将在识别完成后出现在这里，模型请求进度会实时更新。");
      }
      return (
        <article className="transcript-output">
          <div className="output-kicker">识别文本</div>
          <div className="transcript-copy">{transcript}</div>
          {viewingStep.status === "active" && <span className="streaming-caret" aria-hidden="true" />}
        </article>
      );
    }

    if (viewingStage === "segment_chapters") {
      if (chapters.length === 0) {
        return renderEmptyState("正在理解内容结构", "章节标题与时间范围将在分析完成后逐项呈现。");
      }
      return (
        <ol className="chapter-output-list">
          {chapters.map((chapter, index) => (
            <li key={`${String(chapter.title)}-${index}`}>
              <span className="chapter-number">{String(index + 1).padStart(2, "0")}</span>
              <div>
                <h4>{String(chapter.title || `第 ${index + 1} 章`)}</h4>
                <p>{String(chapter.summary || chapter.description || "已识别该章节的内容边界")}</p>
              </div>
              <time>
                {Number(chapter.start_time || 0)}s — {Number(chapter.end_time || 0)}s
              </time>
            </li>
          ))}
        </ol>
      );
    }

    if (viewingStage === "extract_knowledge") {
      const groups = Object.entries(knowledge).filter(([, value]) => Array.isArray(value) && value.length > 0);
      if (groups.length === 0) {
        return renderEmptyState("正在提炼知识脉络", "概念、框架、方法和洞察将在提取完成后分类展示。");
      }
      return (
        <div className="knowledge-output-grid">
          {groups.map(([category, value]) => (
            <section key={category} className="knowledge-output-card">
              <div className="knowledge-card-heading">
                <span>{KNOWLEDGE_LABELS[category] || category}</span>
                <small>{(value as unknown[]).length}</small>
              </div>
              <ul>
                {(value as unknown[]).map((item, index) => (
                  <li key={index}>{typeof item === "string" ? item : JSON.stringify(item)}</li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      );
    }

    if (!blogMarkdown) {
      return renderEmptyState("正在构建文章", "文章内容会在生成后逐段出现，你可以留在这里观察实时输出。");
    }
    return (
      <article className="blog-stream-output">
        <MarkdownRenderer content={blogMarkdown} />
        {viewingStep.status === "active" && <span className="streaming-caret" aria-hidden="true" />}
      </article>
    );
  };

  const streamLabel = streamStatus === "connected"
    ? "实时连接"
    : streamStatus === "reconnecting"
      ? "正在重新连接"
      : "正在建立连接";

  return (
    <div className="processing-workspace">
      <section className={`processing-taskbar ${error ? "has-error" : ""}`} aria-label="任务总进度">
        <div className="processing-task-copy">
          <div className="processing-title-line">
            <span className={`processing-live-dot ${error ? "is-error" : ""}`} />
            <h2>{error ? "处理遇到问题" : "正在整理内容"}</h2>
            <span className={`stream-connection is-${streamStatus}`}>{error ? "处理失败" : streamLabel}</span>
          </div>
          <p title={uploadedName}>{uploadedName || "正在准备任务信息"}</p>
        </div>
        <div className="processing-timeline" role="progressbar" aria-label="任务总进度" aria-valuemin={0} aria-valuemax={100} aria-valuenow={clampProgress(overallPct)}>
          <div className="processing-timeline-meta">
            <span>{completedSteps}/{STAGE_KEYS.length} 完成</span>
            <strong>{clampProgress(overallPct)}%</strong>
          </div>
          <div className="processing-timeline-rail">
            <span className="processing-timeline-line" />
            <span className="processing-timeline-fill" style={{ transform: `scaleX(${clampProgress(overallPct) / 100})` }} />
            {STAGE_KEYS.map((stage, index) => {
              const status = steps[stage]?.status || "pending";
              return (
                <span key={stage} className={`processing-timeline-node is-${status}`}>
                  <span className="processing-timeline-dot">
                    <StatusIcon status={status} index={index} />
                  </span>
                  <small>{STAGE_LABELS[stage]}</small>
                </span>
              );
            })}
          </div>
        </div>
        <div className="processing-task-actions">
          <div>
            <span>已用时</span>
            <strong>{formatElapsed(elapsed)}</strong>
          </div>
          <button type="button" className="processing-cancel-button" onClick={onCancel}>
            {error ? "返回新建" : "终止"}
          </button>
        </div>
      </section>

      {error && <div className="processing-error-banner" role="alert">{error}</div>}

      <div className="processing-mobile-tabs" role="tablist" aria-label="处理信息视图">
        {([
          ["flow", "流程"],
          ["output", "产出"],
          ["progress", "进度"],
        ] as Array<[MobilePanel, string]>).map(([key, label]) => (
          <button
            key={key}
            type="button"
            role="tab"
            aria-selected={mobilePanel === key}
            className={mobilePanel === key ? "is-active" : ""}
            onClick={() => setMobilePanel(key)}
          >
            {label}
            {key !== "flow" && activeStage && <span aria-hidden="true" />}
          </button>
        ))}
      </div>

      <div className="processing-columns">
        <aside className={`processing-flow-panel mobile-panel-${mobilePanel}`} aria-label="处理流程">
          <div className="processing-panel-heading">
            <span>流程概览</span>
            <small>{STAGE_KEYS.length} 个阶段</small>
          </div>
          <ol className="processing-flow-list">
            {STAGE_KEYS.map((stage, index) => {
              const step = steps[stage] ?? { status: "pending" as const, progressPct: 0, detail: "", message: "", result: null };
              const viewable = canViewStage(stage);
              const selected = viewingStage === stage;
              return (
                <li key={stage} className={`is-${step.status} ${selected ? "is-selected" : ""}`}>
                  <button
                    type="button"
                    disabled={!viewable}
                    aria-current={stage === latestStage ? "step" : undefined}
                    onClick={() => {
                      selectStage(stage);
                      setMobilePanel("output");
                    }}
                  >
                    <span className="processing-stage-indicator">
                      <StatusIcon status={step.status} index={index} />
                    </span>
                    <span className="processing-stage-copy">
                      <strong>{STAGE_LABELS[stage]}</strong>
                      <small>{step.status === "active" ? (step.message || step.detail || "正在处理…") : STAGE_DESCRIPTIONS[stage]}</small>
                    </span>
                    {step.status === "completed" && <span className="stage-fixed-mark">完成</span>}
                  </button>
                </li>
              );
            })}
          </ol>
        </aside>

        <main className={`processing-center mobile-panel-${mobilePanel}`}>
          <section
            className={`processing-output-card glass-sweep-card is-${viewingStep.status}`}
            tabIndex={0}
            onKeyDown={(event) => {
              if (!event.altKey) return;
              if (event.key === "ArrowLeft") movePage(-1);
              if (event.key === "ArrowRight") movePage(1);
            }}
            aria-label={`${STAGE_LABELS[viewingStage]}阶段产出`}
          >
            <span key={viewingStage} className="processing-stage-sweep" aria-hidden="true" />
            <header className="processing-output-header">
              <div>
                <div className="processing-output-titleline">
                  <span className="output-stage-index">{String(viewingIndex + 1).padStart(2, "0")}</span>
                  <h3>{STAGE_LABELS[viewingStage]}</h3>
                  <StageStatusBadge status={viewingStep.status} />
                </div>
                <p>{STAGE_DESCRIPTIONS[viewingStage]}</p>
              </div>
              <span className="processing-output-progress">{viewingProgress}%</span>
            </header>

            {!followLatest && viewingStage !== latestStage && (
              <div className="processing-follow-banner">
                <span>后台正在处理：{STAGE_LABELS[latestStage]}</span>
                <button type="button" onClick={showLatest}>回到最新</button>
              </div>
            )}

            <div className="processing-output-scroll" ref={outputScrollRef} onScroll={onOutputScroll}>
              <div key={viewingStage} className="processing-output-content">
                {renderStageOutput()}
              </div>
            </div>

            {!autoScroll && viewingStage === latestStage && (
              <button type="button" className="processing-jump-latest" onClick={showLatest}>
                查看最新内容
                <svg viewBox="0 0 20 20" fill="none" aria-hidden="true">
                  <path d="m5 8 5 5 5-5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>
            )}

            <footer className="processing-output-footer">
              <button type="button" onClick={() => movePage(-1)} disabled={viewingIndex === 0} aria-label="查看上一阶段结果">
                <svg viewBox="0 0 20 20" fill="none" aria-hidden="true"><path d="m12 5-5 5 5 5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>
                上一阶段
              </button>
              <div className="processing-page-dots" aria-label={`第 ${viewingIndex + 1} 个阶段，共 ${STAGE_KEYS.length} 个阶段`}>
                {STAGE_KEYS.map((stage, index) => (
                  <button
                    key={stage}
                    type="button"
                    disabled={!canViewStage(stage)}
                    className={`${stage === viewingStage ? "is-active" : ""} is-${steps[stage]?.status || "pending"}`}
                    onClick={() => selectStage(stage)}
                    aria-label={`查看${STAGE_LABELS[stage]}`}
                    aria-current={stage === viewingStage ? "page" : undefined}
                  >
                    <span />
                    <small>{index + 1}</small>
                  </button>
                ))}
              </div>
              <button type="button" onClick={() => movePage(1)} disabled={viewingIndex === STAGE_KEYS.length - 1 || !canViewStage(STAGE_KEYS[viewingIndex + 1])} aria-label="查看下一阶段结果">
                下一阶段
                <svg viewBox="0 0 20 20" fill="none" aria-hidden="true"><path d="m8 5 5 5-5 5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>
              </button>
            </footer>
          </section>
        </main>

        <aside className={`processing-progress-panel mobile-panel-${mobilePanel}`} aria-label="各阶段处理进度">
          <div className="processing-panel-heading">
            <span>阶段进度</span>
            <small aria-live="polite">{completedSteps}/{STAGE_KEYS.length} 完成</small>
          </div>
          <div className="stage-progress-list">
            {STAGE_KEYS.map((stage, index) => {
              const step = steps[stage] ?? { status: "pending" as const, progressPct: 0, detail: "", message: "", result: null };
              const progress = clampProgress(step.progressPct);
              const viewable = canViewStage(stage);
              return (
                <button
                  key={stage}
                  type="button"
                  disabled={!viewable}
                  className={`stage-progress-card glass-sweep-card is-${step.status} ${viewingStage === stage ? "is-selected" : ""}`}
                  onClick={() => {
                    selectStage(stage);
                    setMobilePanel("output");
                  }}
                >
                  <span className="stage-progress-topline">
                    <span className="stage-progress-name">
                      <small>{String(index + 1).padStart(2, "0")}</small>
                      <strong>{STAGE_LABELS[stage]}</strong>
                    </span>
                    <span className={`stage-progress-state is-${step.status}`}>
                      {step.status === "completed" && <StatusIcon status="completed" index={index} />}
                      {step.status === "active" ? "处理中" : step.status === "completed" ? "已完成" : step.status === "error" ? "失败" : "等待中"}
                    </span>
                  </span>
                  {step.status !== "completed" && (
                    <span className="stage-progress-compact-meta">
                      <strong>{progress}%</strong>
                      {step.apiProgress && step.apiProgress.total > 0 && (
                        <small>请求 {step.apiProgress.completed}/{step.apiProgress.total}</small>
                      )}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </aside>
      </div>
    </div>
  );
}
