// little-plans.js

document.addEventListener('DOMContentLoaded', async () => {
  const supabase = window.supabase;
  const isiOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
  const listContainer = document.querySelector('.your_documents_list');
  const templateItem = listContainer.querySelector('.your_documents_list-item');
  const lightbox = document.querySelector('.your_documents_lightbox');
  const lightboxBg = document.querySelector('.your_documents_lightbox-background');
  const editorContainer = document.getElementById('editor');
  const docInfo = document.getElementById('your_document_information');
  const closeBtn = document.querySelector('.close-lightbox');
  const saveBtn = document.getElementById('save-btn');
  const copyBtn = document.getElementById('copy-btn');
  const dwnldBtn = document.getElementById('dwnld-btn');
  let currentDocId = null;
  let responses = [];

  // Build Quill editor
  editorContainer.innerHTML = '';
  const toolbar = document.createElement('div');
  toolbar.id = 'editor-toolbar';
  toolbar.innerHTML =
    '<span class="ql-formats">' +
      '<select class="ql-header"><option selected></option><option value="1"></option><option value="2"></option></select>' +
      '<button class="ql-bold"></button><button class="ql-italic"></button>' +
      '<button class="ql-underline"></button><button class="ql-link"></button>' +
      '<button class="ql-list" value="bullet"></button><button class="ql-list" value="ordered"></button>' +
    '</span>';
  const quillContainer = document.createElement('div');
  quillContainer.id = 'quill-container';
  editorContainer.append(toolbar, quillContainer);
  const quill = new Quill('#quill-container', {
    modules: { toolbar: '#editor-toolbar' },
    theme: 'snow'
  });

  // Require login
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) {
    window.location.href = '/login';
    return;
  }
  const userId = session.user.id;

  // Fetch documents
  const { data, error } = await supabase
    .from('user_ai_responses')
    .select('id,title,page_slug,updated_at,response_content')
    .eq('user_id', userId)
    .order('updated_at', { ascending: false });
  if (error || !data?.length) {
    listContainer.innerHTML = '<p>No documents found or error loading.</p>';
    return;
  }
  responses = data;

  // Populate list (Download + Edit)
  responses.forEach(doc => {
    const item = templateItem.cloneNode(true);
    item.style.display = '';
    item.dataset.docId = doc.id;
    item.querySelector('.heading-style-h6').textContent = doc.title || 'Untitled';
    item.querySelector('.text-size-small').textContent = doc.page_slug || 'Unknown Tool';
    const btnGroup = item.querySelector('.button-group');
    if (btnGroup) btnGroup.innerHTML = '';

    // Download button in list
    const downloadBtn = document.createElement('button');
    downloadBtn.textContent = 'Download';
    downloadBtn.classList.add('button');
    downloadBtn.addEventListener('click', e => {
      e.stopPropagation();
      const html = doc.response_content || '';
      if (!html) {
        alert('No content to download.');
        return;
      }

      const parser = new DOMParser();
      const titleText = parser.parseFromString(html, 'text/html')
                              .querySelector('h1')?.textContent.trim() || 'Little-Plans-Document';
      const adjustedHTML = html.replace(/<h1>(.*?)<\/h1>/i, '<h1 style="color:#2B697A;">$1</h1>');

      if (isiOS) {
        // iOS: download as .md
        const fullMD = `
# ${titleText}

${adjustedHTML.replace(/<[^>]+>/g, '')}
        `;
        const blob = new Blob([fullMD], { type: 'text/markdown;charset=utf-8' });
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = titleText.replace(/[\/:*?"<>|]/g, '') + '.md';
        document.body.append(link);
        link.click();
        link.remove();
        URL.revokeObjectURL(link.href);
      } else {
        // Non-iOS: download .docx
        const fullHTML = `
<!DOCTYPE html>
<html><head><meta charset="utf-8"></head>
  <body style="font-family:Arial,sans-serif;">
    <div>${adjustedHTML}</div>
  </body>
</html>`;
        const converted = window.htmlDocx.asBlob(fullHTML);
        const link = document.createElement('a');
        link.href = URL.createObjectURL(converted);
        link.download = titleText.replace(/[\/:*?"<>|]/g, '') + '.docx';
        document.body.append(link);
        link.click();
        link.remove();
        URL.revokeObjectURL(link.href);
      }
    });

    // Edit button
    const editBtn = document.createElement('button');
    editBtn.textContent = 'Edit';
    editBtn.classList.add('button', 'is-secondary');
    editBtn.addEventListener('click', e => {
      e.stopPropagation();
      lightboxBg.style.display = 'block';
      lightbox.style.display = 'flex';
      quill.setContents([]);
      const freshDoc = responses.find(r => r.id === doc.id) || {};
      quill.setContents(quill.clipboard.convert(freshDoc.response_content || ''));
      docInfo.textContent = 'Last updated: ' + new Date(freshDoc.updated_at).toLocaleString();
      currentDocId = doc.id;
      saveBtn.style.display = 'inline-block';
      copyBtn.style.display = 'inline-block';
      dwnldBtn.style.display = 'inline-block';
    });

    if (btnGroup) btnGroup.append(downloadBtn, editBtn);
    listContainer.appendChild(item);
  });
  templateItem.remove();

  // Close lightbox
  closeBtn.addEventListener('click', () => {
    lightbox.style.display = 'none';
    lightboxBg.style.display = 'none';
    quill.setContents([]);
    currentDocId = null;
    saveBtn.style.display = 'none';
    copyBtn.style.display = 'none';
    dwnldBtn.style.display = 'none';
  });

  // Save edited content
  saveBtn.addEventListener('click', async () => {
    if (!currentDocId) return alert('No document loaded.');
    const updatedHTML = quill.root.innerHTML;
    const parser2 = new DOMParser();
    const title = parser2.parseFromString(updatedHTML, 'text/html')
                         .querySelector('h1')?.textContent.trim() || 'Untitled';
    const { error } = await supabase
      .from('user_ai_responses')
      .update({ response_content: updatedHTML, title, updated_at: new Date() })
      .eq('id', currentDocId);
    if (error) {
      alert('Error saving.');
    } else {
      alert('Document saved!');
      const updatedItem = document.querySelector(`.your_documents_list-item[data-doc-id="${currentDocId}"]`);
      if (updatedItem) {
        updatedItem.querySelector('.your_documents_list_title-wrapper .heading-style-h6').textContent = title;
      }
      const idx = responses.findIndex(r => r.id === currentDocId);
      if (idx !== -1) {
        responses[idx].response_content = updatedHTML;
        responses[idx].title = title;
        responses[idx].updated_at = new Date().toISOString();
      }
      closeBtn.click();
    }
  });

  // Download from lightbox
  dwnldBtn?.addEventListener('click', () => {
    if (!quill) return alert('Nothing to download.');
    const html = quill.root.innerHTML;
    const parser = new DOMParser();
    const titleText = parser.parseFromString(html, 'text/html')
                            .querySelector('h1')?.textContent.trim() || 'Document';
    const adjustedHTML = html.replace(/<h1>(.*?)<\/h1>/i, '<h1 style="color:#2B697A;">$1</h1>');

    if (isiOS) {
      // iOS: download as .md
      const fullMD = `
# ${titleText}

${adjustedHTML.replace(/<[^>]+>/g, '')}
      `;
      const blob = new Blob([fullMD], { type: 'text/markdown;charset=utf-8' });
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = titleText.replace(/[\/:*?"<>|]/g, '') + '.md';
      document.body.append(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(link.href);
    } else {
      // Non-iOS: download .docx
      const fullHTML = `
<!DOCTYPE html>
<html><head><meta charset="utf-8"></head>
  <body style="font-family:Arial,sans-serif;">
    <div>${adjustedHTML}</div>
  </body>
</html>`;
      const converted = window.htmlDocx.asBlob(fullHTML);
      const link = document.createElement('a');
      link.href = URL.createObjectURL(converted);
      link.download = titleText.replace(/[\/:*?"<>|]/g, '') + '.docx';
      document.body.append(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(link.href);
    }
  });

  // Copy from lightbox
  copyBtn?.addEventListener('click', () => {
    if (!quill) return alert('Nothing to copy.');
    const range = document.createRange();
    range.selectNodeContents(quill.root);
    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(range);
    try {
      document.execCommand('copy');
      alert('Document copied!');
    } catch {
      alert('Copy failed.');
    }
    sel.removeAllRanges();
  });
});
