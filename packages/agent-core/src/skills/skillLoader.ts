/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Regex to split a Markdown file into frontmatter and body.
 * Frontmatter must be enclosed in triple dashes (---).
 */
export const FRONTMATTER_REGEX = /^---\s*\n([\s\S]*?)\n---\s*\n?([\s\S]*)$/;
