import { supabaseClient } from './supabase.js';

export const bugReporter = {
  open: () => {
    const modal = document.getElementById('bug-report-modal');
    if (modal) modal.classList.remove('hidden');
  },
  close: () => {
    const modal = document.getElementById('bug-report-modal');
    if (modal) modal.classList.add('hidden');

    const messageInput = document.getElementById('bug-message');
    if (messageInput) messageInput.value = '';

    const fileInput = document.getElementById('bug-screenshot');
    if (fileInput) fileInput.value = '';
  },
  async submit() {
    if (!supabaseClient) {
      alert('Bug reporting is unavailable — Supabase SDK did not load.');
      return;
    }

    const message = document.getElementById('bug-message')?.value.trim();
    const file = document.getElementById('bug-screenshot')?.files[0];
    const jlptLevel = document.getElementById('jlpt-level-select')?.value || 'Unknown';
    const submitBtn = document.getElementById('bug-submit-btn');

    if (!message) {
      alert('Please provide a description of the bug.');
      return;
    }

    try {
      if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.textContent = 'Uploading...';
      }

      let screenshotUrl = null;
      if (file) {
        const fileName = `${Date.now()}-${file.name}`;
        const { data: uploadData, error: uploadError } = await supabaseClient.storage
          .from('bug-screenshots').upload(fileName, file);

        if (uploadError) throw uploadError;

        const { data: urlData } = supabaseClient.storage.from('bug-screenshots').getPublicUrl(uploadData.path);
        screenshotUrl = urlData.publicUrl;
      }

      const { error: insertError } = await supabaseClient.from('bug_reports').insert({
        message,
        user_agent: navigator.userAgent,
        jlpt_level: jlptLevel,
        screenshot_url: screenshotUrl
      });

      if (insertError) throw insertError;

      alert('Thank you! Your report has been submitted.');
      this.close();
    } catch (err) {
      console.error('Bug report submission error:', err);
      alert(`Error submitting report: ${err.message || 'Unknown error'}. Please check your Supabase configuration.`);
    } finally {
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.textContent = 'Submit Report';
      }
    }
  }
};
