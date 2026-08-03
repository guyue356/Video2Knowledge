"use client";

import dynamic from "next/dynamic";
import { useState } from "react";
import { type TabKey, TAB_LABELS } from "./useStageData";

const MarkdownRenderer = dynamic(() => import("./MarkdownRenderer"), {
  loading: () => <div className="animate-pulse h-64 bg-zinc-100 rounded-lg" />,
});

const API_BASE = "http://localhost:8001";

const KNOWLEDGE_CATEGORIES = [
  "concepts",
  "frameworks",
  "methods",
  "tools",
  "papers",
  "code_examples",
  "insights",
] as const;

const KNOWLEDGE_LABELS: Record<string, string> = {
  concepts: "概念",
  frameworks: "框架",
  methods: "方法",
  tools: "工具",
  papers: "论文",
  code_examples: "代码示例",
  insights: "洞察",
};

function formatDuration(sec: number): string {
  if (!sec) return "--";
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

interface ExportHandlers {
  onExportMd?: () => void;
  onExportTxt?: () => void;
  onExportSrt?: () => void;
  onExportJson?: (stage: string) => void;
  onDownloadAudio?: () => void;
}

interface StageViewerProps {
  videoId: string;
  filename?: string;
  duration?: number;
  stageData: Record<string, Record<string, unknown>>;
  audioUrl: string | null;
  activeTab: TabKey;
  onTabChange: (tab: TabKey) => void;
  /** Whether to show export/download buttons. Default: false */
  showExport?: boolean;
  /** Blog content. Falls back to stageData.blog if not provided */
  blogMarkdown?: string;
  blogId?: number | null;
  exportHandlers?: ExportHandlers;
  /** Callback to regenerate blog only (skip transcript/chapters/knowledge) */
  onRegenerate?: () => void;
  /** Whether blog regeneration is in progress */
  regenerating?: boolean;
}

export default function StageViewer({
  videoId,
  filename,
  duration,
  stageData,
  audioUrl,
  activeTab,
  onTabChange,
  showExport = false,
  blogMarkdown,
  blogId,
  exportHandlers,
  onRegenerate,
  regenerating = false,
}: StageViewerProps) {
  const sd = stageData;
  const [expandedKnowledge, setExpandedKnowledge] = useState<Record<string, boolean>>({});

  // Resolve blog content from props or stageData
  const resolvedBlogMd = blogMarkdown ?? (sd.blog?.markdown as string) ?? "";

  return (
    <div>
      {/* Tab bar */}
      <div className="mb-4 flex gap-1 overflow-x-auto border-b border-zinc-200/80">
        {(Object.keys(TAB_LABELS) as TabKey[]).map((key) => (
          <button
            key={key}
            onClick={() => onTabChange(key)}
            className={`relative flex-none px-4 py-3 text-sm font-medium transition-colors ${
              activeTab === key
                ? "text-zinc-900 after:absolute after:inset-x-3 after:bottom-0 after:h-0.5 after:bg-blue-600"
                : "text-zinc-500 hover:text-zinc-800"
            }`}
          >
            {TAB_LABELS[key]}
          </button>
        ))}
      </div>

      {/* Tab panels */}
      <div className="surface-card min-h-[400px] p-6 sm:p-7">
        {/* Video */}
        {activeTab === "video" && (
          <div>
            <h3 className="text-lg font-semibold mb-4">原始视频</h3>
            <div className="rounded-xl bg-zinc-950 p-3">
              <video
                controls
                className="w-full max-h-[60vh] rounded-xl"
                src={`${API_BASE}/api/video/${videoId}`}
              >
                您的浏览器不支持视频播放
              </video>
              <div className="mt-3 flex flex-wrap items-center gap-4 px-1 text-xs text-zinc-400">
                {filename && <span>文件: {filename}</span>}
                {duration != null && <span>时长: {formatDuration(duration)}</span>}
                {!filename && <span>视频 ID: {videoId}</span>}
              </div>
            </div>
          </div>
        )}

        {/* Audio */}
        {activeTab === "audio" && (
          <div>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold">音频</h3>
              {showExport && exportHandlers?.onDownloadAudio && (
                <button
                  onClick={exportHandlers.onDownloadAudio}
                  disabled={!audioUrl}
                  className="btn-secondary min-h-9 px-3"
                >
                  下载 .wav
                </button>
              )}
            </div>
            {audioUrl ? (
              <div className="rounded-xl bg-zinc-100 p-4">
                <audio controls src={audioUrl} className="w-full" />
                <p className="text-xs text-zinc-500 mt-2">
                  时长:{" "}
                  {sd.audio?.duration
                    ? `${Number(sd.audio.duration).toFixed(1)}秒`
                    : "无"}
                </p>
              </div>
            ) : (
              <p className="text-zinc-500">暂无音频</p>
            )}
          </div>
        )}

        {/* Transcript */}
        {activeTab === "transcript" && (
          <div>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold">转录文本</h3>
              {showExport && (
                <div className="flex gap-2">
                  {exportHandlers?.onExportTxt && (
                    <button
                      onClick={exportHandlers.onExportTxt}
                      className="btn-primary min-h-9 px-3"
                    >
                      导出 .txt
                    </button>
                  )}
                  {exportHandlers?.onExportSrt && (
                    <button
                      onClick={exportHandlers.onExportSrt}
                      className="btn-secondary min-h-9 px-3 text-emerald-700"
                    >
                      导出 .srt
                    </button>
                  )}
                </div>
              )}
            </div>
            {sd.transcript?.segments ? (
              <div className="max-h-[60vh] overflow-y-auto rounded-xl border border-zinc-200 bg-zinc-50 p-5">
                <div className="whitespace-pre-wrap text-sm leading-7 text-zinc-700">
                  {(
                    sd.transcript.segments as Array<{
                      start: number;
                      end: number;
                      text: string;
                    }>
                  )
                    .map(
                      (s) =>
                        `[${s.start.toFixed(1)}秒-${s.end.toFixed(1)}秒] ${s.text}`
                    )
                    .join("\n")}
                </div>
              </div>
            ) : sd.transcript?.transcript ? (
              <div className="max-h-[60vh] overflow-y-auto rounded-xl border border-zinc-200 bg-zinc-50 p-5">
                <div className="whitespace-pre-wrap text-sm leading-7 text-zinc-700">
                  {String(sd.transcript.transcript)}
                </div>
              </div>
            ) : (
              <p className="text-zinc-500">暂无转录文本</p>
            )}
          </div>
        )}

        {/* Chapters */}
        {activeTab === "chapters" && (
          <div>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold">章节结构</h3>
              {showExport && exportHandlers?.onExportJson && (
                <button
                  onClick={() => exportHandlers.onExportJson!("chapters")}
                  className="btn-secondary min-h-9 px-3"
                >
                  导出 .json
                </button>
              )}
            </div>
            {sd.chapters?.chapters ? (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-zinc-300">
                      <th className="text-left py-2 px-3 text-zinc-400 font-medium">#</th>
                      <th className="text-left py-2 px-3 text-zinc-400 font-medium">标题</th>
                      <th className="text-left py-2 px-3 text-zinc-400 font-medium">时间范围</th>
                      <th className="text-left py-2 px-3 text-zinc-400 font-medium">重要度</th>
                      <th className="text-left py-2 px-3 text-zinc-400 font-medium">摘要</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(
                      sd.chapters.chapters as Array<{
                        title: string;
                        start_time: number;
                        end_time: number;
                        importance_score: number;
                        summary: string;
                      }>
                    ).map((ch, i) => (
                      <tr
                        key={i}
                        className="border-b border-zinc-100 transition-colors hover:bg-zinc-50"
                      >
                        <td className="py-2 px-3 text-zinc-500">{i + 1}</td>
                        <td className="py-2 px-3 text-zinc-800 font-medium">
                          {ch.title}
                        </td>
                        <td className="py-2 px-3 text-zinc-400 font-mono text-xs">
                          {ch.start_time}秒 — {ch.end_time}秒
                        </td>
                        <td className="py-2 px-3">
                          <span
                            className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${
                              ch.importance_score >= 8
                                ? "bg-red-100 text-red-700"
                                : ch.importance_score >= 5
                                  ? "bg-yellow-100 text-yellow-700"
                                  : "bg-zinc-300 text-zinc-400"
                            }`}
                          >
                            {ch.importance_score}
                          </span>
                        </td>
                        <td className="py-2 px-3 text-zinc-400 text-xs max-w-xs truncate">
                          {ch.summary}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="text-zinc-500">暂无章节</p>
            )}
          </div>
        )}

        {/* Knowledge */}
        {activeTab === "knowledge" && (
          <div>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold">知识提取</h3>
              {showExport && exportHandlers?.onExportJson && (
                <button
                  onClick={() => exportHandlers.onExportJson!("knowledge")}
                  className="btn-secondary min-h-9 px-3"
                >
                  导出 .json
                </button>
              )}
            </div>
            {sd.knowledge && Object.keys(sd.knowledge).length > 0 ? (
              <div className="grid gap-4 sm:grid-cols-2">
                {KNOWLEDGE_CATEGORIES.map((cat) => {
                  const items = sd.knowledge[cat] as string[] | undefined;
                  if (!items || items.length === 0) return null;
                  const expansionKey = `${videoId}:${cat}`;
                  const isExpanded = Boolean(expandedKnowledge[expansionKey]);
                  const visibleItems = isExpanded ? items : items.slice(0, 3);
                  const listId = `knowledge-${videoId}-${cat}`;
                  return (
                    <div
                      key={cat}
                      className="surface-card overflow-hidden"
                    >
                      <div className="flex items-center justify-between gap-3 px-4 pt-4 pb-2">
                        <h4 className="text-sm font-semibold text-zinc-800">
                          {KNOWLEDGE_LABELS[cat]}
                        </h4>
                        <span className="text-[11px] text-zinc-400">{items.length} 条</span>
                      </div>
                      <ul id={listId} className="space-y-1 px-4 pb-4">
                        {visibleItems.map((item, i) => (
                          <li
                            key={i}
                            className="text-sm text-zinc-700 flex items-start gap-2"
                          >
                            <span className="text-zinc-400 mt-0.5">*</span>
                            <span>{item}</span>
                          </li>
                        ))}
                      </ul>
                      {items.length > 3 && (
                        <button
                          type="button"
                          aria-expanded={isExpanded}
                          aria-controls={listId}
                          onClick={() => {
                            setExpandedKnowledge((current) => ({
                              ...current,
                              [expansionKey]: !current[expansionKey],
                            }));
                          }}
                          className="flex min-h-10 w-full items-center justify-center gap-1.5 border-t border-zinc-100 bg-zinc-50/70 px-4 text-xs font-medium text-zinc-500 transition-colors hover:bg-zinc-100 hover:text-blue-700"
                        >
                          {isExpanded ? "收起" : `展开全部（${items.length}）`}
                          <svg
                            className={`h-3.5 w-3.5 transition-transform duration-200 ${isExpanded ? "rotate-180" : ""}`}
                            viewBox="0 0 20 20"
                            fill="none"
                            aria-hidden="true"
                          >
                            <path d="m6 8 4 4 4-4" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
                          </svg>
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="text-zinc-500">暂无知识数据</p>
            )}
          </div>
        )}

        {/* Blog */}
        {activeTab === "blog" && (
          <div>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold">文章</h3>
              <div className="flex gap-2">
                {onRegenerate && (
                  <button
                    onClick={onRegenerate}
                    disabled={regenerating}
                    className="btn-secondary min-h-9 px-3 text-amber-700"
                  >
                    {regenerating ? "生成中..." : "重新生成文章"}
                  </button>
                )}
                {showExport && exportHandlers?.onExportMd && (
                  <button
                    onClick={exportHandlers.onExportMd}
                    disabled={!blogId}
                    className="btn-primary min-h-9 px-3"
                  >
                    导出 .md
                  </button>
                )}
              </div>
            </div>
            {resolvedBlogMd ? (
              <article className="surface-card mx-auto max-w-[820px] p-6 sm:p-9">
                <MarkdownRenderer content={resolvedBlogMd} />
              </article>
            ) : (
              <p className="text-zinc-500">暂无文章</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
