import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, fireEvent } from '@testing-library/svelte';
import { tick } from 'svelte';

const { upload, getPublicUrl, insert } = vi.hoisted(() => ({
  upload: vi.fn(),
  getPublicUrl: vi.fn(),
  insert: vi.fn(),
}));
vi.mock('../src/lib/supabase.js', () => ({
  supabaseClient: {
    storage: { from: vi.fn(() => ({ upload, getPublicUrl })) },
    from: vi.fn(() => ({ insert })),
  },
}));

import {
  bugReport, openBugReport, closeBugReport, screenshotStoragePath,
} from '../src/lib/bugReport.svelte.js';
import BugReportModal from '../src/lib/components/BugReportModal.svelte';
import { q } from './helpers.js';

describe('screenshotStoragePath', () => {
  it('keeps safe ASCII names', () => {
    expect(screenshotStoragePath('bug-1.png', 123)).toBe('123-bug-1.png');
  });

  it('replaces non-ASCII and unsafe characters', () => {
    expect(screenshotStoragePath('スクリーンショット 2026-11-04 10.15.30.png', 123))
      .toBe('123-2026-11-04_10.15.30.png');
    expect(screenshotStoragePath('../../etc/passwd', 123)).toBe('123-etc_passwd');
  });

  it('falls back when nothing usable is left', () => {
    expect(screenshotStoragePath('画像', 123)).toBe('123-screenshot');
    expect(screenshotStoragePath('', 123)).toBe('123-screenshot');
  });
});

describe('BugReportModal', () => {
  beforeEach(() => {
    closeBugReport();
    bugReport.submitting = false;
    upload.mockReset();
    getPublicUrl.mockReset();
    insert.mockReset();
    vi.stubGlobal('alert', vi.fn());
    localStorage.clear();
    localStorage.setItem('jlpt_level', 'N4');
  });

  it('is not rendered until opened, and Close hides it', async () => {
    const { container } = render(BugReportModal);
    expect(container.querySelector('#bug-report-modal')).toBeNull();

    openBugReport();
    await tick();
    expect(container.querySelector('#bug-report-modal')).not.toBeNull();

    await fireEvent.click(container.querySelector('#bug-close-btn'));
    expect(container.querySelector('#bug-report-modal')).toBeNull();
  });

  it('starts with an empty description each time it opens', async () => {
    const { container } = render(BugReportModal);
    openBugReport();
    await tick();
    await fireEvent.input(container.querySelector('#bug-message'), { target: { value: 'half typed' } });
    closeBugReport();
    await tick();

    openBugReport();
    await tick();
    expect(q(container, '#bug-message').value).toBe('');
  });

  it('asks for a description instead of submitting an empty report', async () => {
    const { container } = render(BugReportModal);
    openBugReport();
    await tick();

    await fireEvent.click(container.querySelector('#bug-submit-btn'));

    expect(alert).toHaveBeenCalledWith('Please provide a description of the bug.');
    expect(insert).not.toHaveBeenCalled();
    expect(bugReport.open).toBe(true);
  });

  it('submits the report with the JLPT level setting and closes', async () => {
    insert.mockResolvedValue({ error: null });
    const { container } = render(BugReportModal);
    openBugReport();
    await tick();

    await fireEvent.input(container.querySelector('#bug-message'), { target: { value: '  Mic stops early  ' } });
    await fireEvent.click(container.querySelector('#bug-submit-btn'));
    await vi.waitFor(() => expect(bugReport.open).toBe(false));

    expect(upload).not.toHaveBeenCalled();
    expect(insert).toHaveBeenCalledWith({
      message: 'Mic stops early',
      user_agent: navigator.userAgent,
      jlpt_level: 'N4',
      screenshot_url: null,
    });
    expect(alert).toHaveBeenCalledWith('Thank you! Your report has been submitted.');
  });

  it('uploads the screenshot under a safe path and links it', async () => {
    upload.mockResolvedValue({ data: { path: 'stored.png' }, error: null });
    getPublicUrl.mockReturnValue({ data: { publicUrl: 'https://cdn/stored.png' } });
    insert.mockResolvedValue({ error: null });
    const { container } = render(BugReportModal);
    openBugReport();
    await tick();

    const file = new File(['png'], 'スクリーンショット 1.png', { type: 'image/png' });
    const fileInput = container.querySelector('#bug-screenshot');
    Object.defineProperty(fileInput, 'files', { value: [file], configurable: true, writable: true });
    await fireEvent.change(fileInput);
    await fireEvent.input(container.querySelector('#bug-message'), { target: { value: 'Broken' } });
    await fireEvent.click(container.querySelector('#bug-submit-btn'));
    await vi.waitFor(() => expect(bugReport.open).toBe(false));

    const [path, uploaded] = upload.mock.calls[0];
    expect(path).toMatch(/^\d+-1\.png$/);
    expect(uploaded).toBe(file);
    expect(insert.mock.calls[0][0].screenshot_url).toBe('https://cdn/stored.png');
  });

  it('shows Uploading… and disables Submit while sending', async () => {
    /** @type {any} */ let resolve;
    insert.mockImplementation(() => new Promise((r) => { resolve = r; }));
    const { container } = render(BugReportModal);
    openBugReport();
    await tick();

    await fireEvent.input(container.querySelector('#bug-message'), { target: { value: 'Broken' } });
    await fireEvent.click(container.querySelector('#bug-submit-btn'));
    await tick();
    const submit = q(container, '#bug-submit-btn');
    expect(submit.disabled).toBe(true);
    expect(submit.textContent.trim()).toBe('Uploading...');

    resolve({ error: null });
    await vi.waitFor(() => expect(bugReport.open).toBe(false));
  });

  it('keeps the modal open and reports the error when saving fails', async () => {
    insert.mockResolvedValue({ error: { message: 'permission denied' } });
    const { container } = render(BugReportModal);
    openBugReport();
    await tick();

    await fireEvent.input(container.querySelector('#bug-message'), { target: { value: 'Broken' } });
    await fireEvent.click(container.querySelector('#bug-submit-btn'));
    await vi.waitFor(() => expect(bugReport.submitting).toBe(false));

    expect(bugReport.open).toBe(true);
    expect(alert).toHaveBeenCalledWith(expect.stringContaining('permission denied'));
    expect(container.querySelector('#bug-submit-btn').textContent.trim()).toBe('Submit Report');
  });
});
