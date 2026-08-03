"use client";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeHighlight from "rehype-highlight";

export default function MarkdownRenderer({ content }: { content: string }) {
  return (
    <article className="prose prose-zinc max-w-none text-[16px]
      prose-headings:text-zinc-900 prose-headings:font-semibold prose-headings:tracking-tight
      prose-h1:mb-8 prose-h1:text-3xl prose-h2:mt-12 prose-h2:text-2xl prose-h3:mt-8 prose-h3:text-xl
      prose-p:text-zinc-700 prose-p:leading-[1.8]
      prose-code:text-blue-700 prose-code:text-sm
      prose-pre:rounded-xl prose-pre:bg-zinc-950 prose-pre:border prose-pre:border-white/10
      prose-a:text-blue-700 prose-a:no-underline hover:prose-a:underline
      prose-li:text-zinc-700
      prose-strong:text-zinc-800
      prose-blockquote:border-blue-600 prose-blockquote:text-zinc-500
      prose-table:border-zinc-300
      prose-th:text-zinc-700 prose-th:bg-zinc-50
      prose-td:text-zinc-600 prose-td:border-zinc-200
    ">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[rehypeHighlight]}
      >
        {content}
      </ReactMarkdown>
    </article>
  );
}
