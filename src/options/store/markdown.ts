import DOMPurify from "dompurify";
import { marked } from "marked";

marked.setOptions({
  breaks: true,
  gfm: true,
});

const renderer = new marked.Renderer();
renderer.link = ({ href, text }) => {
  return `<a href="${href}" target="_blank" rel="noopener noreferrer">${text}</a>`;
};
renderer.image = ({ href, title, text }) => {
  const src = href.replace(
    /^https?:\/\/github\.com\/([^/]+\/[^/]+)\/blob\/(.+)/,
    "https://raw.githubusercontent.com/$1/$2"
  );
  const titleAttr = title ? ` title="${title}"` : "";
  return `<img src="${src}" alt="${text}"${titleAttr} />`;
};
marked.use({ renderer });

export function parseMarkdown(text: string): DocumentFragment {
  const content = text.replace(/^[\u200B\u200C\u200D\u200E\u200F\uFEFF]/, "");
  const html = marked.parse(content, { async: false }) as string;

  const sanitized = DOMPurify.sanitize(html.trim());

  const parser = new DOMParser();
  const doc = parser.parseFromString(`<template>${sanitized}</template>`, "text/html");
  const template = doc.querySelector("template");
  return template ? template.content : document.createDocumentFragment();
}
