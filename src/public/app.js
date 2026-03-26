(function () {
  'use strict';

  const providerSelect = document.getElementById('provider-select');
  const modelSelect = document.getElementById('model-select');
  const chatMessages = document.getElementById('chat-messages');
  const messageInput = document.getElementById('message-input');
  const sendButton = document.getElementById('send-button');
  const loadingIndicator = document.getElementById('loading-indicator');

  /** @type {{ role: string; content: string }[]} */
  const conversationHistory = [];

  async function loadModels() {
    const provider = providerSelect.value;
    modelSelect.innerHTML = '<option value="">Loading...</option>';
    modelSelect.disabled = true;
    try {
      const res = await fetch(`/api/models?provider=${encodeURIComponent(provider)}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to load models');
      modelSelect.innerHTML = '';
      if (data.models && data.models.length > 0) {
        data.models.forEach((m) => {
          const opt = document.createElement('option');
          opt.value = m;
          opt.textContent = m;
          modelSelect.appendChild(opt);
        });
      } else {
        modelSelect.innerHTML = '<option value="">No models found</option>';
      }
    } catch (err) {
      modelSelect.innerHTML = '<option value="">Error loading models</option>';
      showError(err.message || 'Could not load models');
    } finally {
      modelSelect.disabled = false;
    }
  }

  function showError(message) {
    const el = document.createElement('div');
    el.className = 'error-message';
    el.textContent = '⚠️ ' + message;
    chatMessages.appendChild(el);
    scrollToBottom();
    setTimeout(() => el.remove(), 8000);
  }

  function appendMessage(role, content, meta) {
    const wrapper = document.createElement('div');
    wrapper.className = `message ${role}`;

    const roleLabel = document.createElement('div');
    roleLabel.className = 'message-role';
    roleLabel.textContent = role === 'user' ? 'You' : 'Assistant';

    const bubble = document.createElement('div');
    bubble.className = 'message-bubble';
    bubble.textContent = content;

    wrapper.appendChild(roleLabel);
    wrapper.appendChild(bubble);

    if (meta) {
      const metaEl = document.createElement('div');
      metaEl.className = 'message-meta';
      metaEl.textContent = meta;
      wrapper.appendChild(metaEl);
    }

    const welcome = chatMessages.querySelector('.welcome-message');
    if (welcome) welcome.remove();

    chatMessages.appendChild(wrapper);
    scrollToBottom();
  }

  function scrollToBottom() {
    const container = chatMessages.closest('.chat-container') || chatMessages.parentElement;
    if (container) container.scrollTop = container.scrollHeight;
  }

  async function sendMessage() {
    const text = messageInput.value.trim();
    if (!text) return;

    const model = modelSelect.value;
    const provider = providerSelect.value;

    if (!model) {
      showError('Please select a model first.');
      return;
    }

    conversationHistory.push({ role: 'user', content: text });
    appendMessage('user', text);
    messageInput.value = '';
    messageInput.style.height = 'auto';

    setLoading(true);
    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: conversationHistory,
          model,
          provider,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Chat request failed');

      conversationHistory.push({ role: 'assistant', content: data.content });
      appendMessage('assistant', data.content, `${data.provider} · ${data.model}`);
    } catch (err) {
      conversationHistory.pop();
      showError(err.message || 'Failed to get AI response');
    } finally {
      setLoading(false);
    }
  }

  function setLoading(loading) {
    loadingIndicator.classList.toggle('hidden', !loading);
    sendButton.disabled = loading;
    messageInput.disabled = loading;
  }

  messageInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  });

  messageInput.addEventListener('input', () => {
    messageInput.style.height = 'auto';
    messageInput.style.height = Math.min(messageInput.scrollHeight, 120) + 'px';
  });

  sendButton.addEventListener('click', sendMessage);
  providerSelect.addEventListener('change', loadModels);

  loadModels();
})();
