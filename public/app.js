// State
let selectedFiles = [];
let galleryImages = [];
let selectedImageIds = new Set();

// DOM Elements
const dropzone = document.getElementById('dropzone');
const fileInput = document.getElementById('fileInput');
const stagingArea = document.getElementById('stagingArea');
const stagingGrid = document.getElementById('stagingGrid');
const uploadBtn = document.getElementById('uploadBtn');
const clearStagingBtn = document.getElementById('clearStagingBtn');
const progressBar = document.getElementById('progressBar');
const progressFill = document.getElementById('progressFill');
const imageGrid = document.getElementById('imageGrid');
const emptyState = document.getElementById('emptyState');
const galleryCount = document.getElementById('galleryCount');
const selectAllBtn = document.getElementById('selectAllBtn');
const deleteBatchBtn = document.getElementById('deleteBatchBtn');
const toastContainer = document.getElementById('toastContainer');
const lightbox = document.getElementById('lightbox');
const lightboxImg = document.getElementById('lightboxImg');
const lightboxName = document.getElementById('lightboxName');
const lightboxLink = document.getElementById('lightboxLink');

// Toast Notification
function showToast(message, type = 'info') {
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.innerHTML = `
    <span>${type === 'success' ? '✓' : type === 'error' ? '✕' : 'ℹ'}</span>
    <span>${message}</span>
  `;
  toastContainer.appendChild(toast);
  setTimeout(() => {
    toast.style.opacity = '0';
    setTimeout(() => toast.remove(), 250);
  }, 3500);
}

// Utility: Format File Size
function formatBytes(bytes, decimals = 1) {
  if (!bytes || bytes === 0) return '0 B';
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
}

// Utility: Relative Time
function timeAgo(dateString) {
  if (!dateString) return 'Just now';
  const now = new Date();
  const past = new Date(dateString);
  const diffInSeconds = Math.floor((now - past) / 1000);
  if (diffInSeconds < 60) return 'Just now';
  const diffInMinutes = Math.floor(diffInSeconds / 60);
  if (diffInMinutes < 60) return `${diffInMinutes}m ago`;
  const diffInHours = Math.floor(diffInMinutes / 60);
  if (diffInHours < 24) return `${diffInHours}h ago`;
  const diffInDays = Math.floor(diffInHours / 24);
  return `${diffInDays}d ago`;
}

// Load System Config & Badges
async function loadConfig() {
  try {
    const res = await fetch('/api/config');
    if (!res.ok) return;
    const data = await res.json();
    
    const storageBadge = document.getElementById('storageBadge');
    const mongoBadge = document.getElementById('mongoBadge');
    
    if (data.storageType === 's3') {
      storageBadge.className = 'badge badge-s3';
      storageBadge.innerHTML = `<span class="badge-dot"></span> AWS S3: ${data.bucket || 'Active'}`;
    } else {
      storageBadge.className = 'badge badge-local';
      storageBadge.innerHTML = `<span class="badge-dot"></span> Local Storage`;
    }

    if (data.mongoConnected) {
      mongoBadge.className = 'badge badge-mongo';
      mongoBadge.innerHTML = `<span class="badge-dot"></span> MongoDB Connected`;
    } else {
      mongoBadge.className = 'badge badge-local';
      mongoBadge.innerHTML = `<span class="badge-dot"></span> MongoDB Offline`;
    }
  } catch (err) {
    console.error('Failed to load system config:', err);
  }
}

// Dropzone Events
dropzone.addEventListener('click', () => fileInput.click());

['dragenter', 'dragover'].forEach(eventName => {
  dropzone.addEventListener(eventName, (e) => {
    e.preventDefault();
    e.stopPropagation();
    dropzone.classList.add('dragover');
  });
});

['dragleave', 'drop'].forEach(eventName => {
  dropzone.addEventListener(eventName, (e) => {
    e.preventDefault();
    e.stopPropagation();
    dropzone.classList.remove('dragover');
  });
});

dropzone.addEventListener('drop', (e) => {
  const dt = e.dataTransfer;
  const files = Array.from(dt.files).filter(f => f.type.startsWith('image/'));
  if (files.length === 0) {
    showToast('Only image files are supported', 'error');
    return;
  }
  handleFilesSelected(files);
});

fileInput.addEventListener('change', (e) => {
  const files = Array.from(e.target.files);
  handleFilesSelected(files);
});

function handleFilesSelected(newFiles) {
  selectedFiles = [...selectedFiles, ...newFiles];
  renderStaging();
}

function renderStaging() {
  stagingGrid.innerHTML = '';
  if (selectedFiles.length === 0) {
    stagingArea.classList.remove('active');
    fileInput.value = '';
    return;
  }
  stagingArea.classList.add('active');
  
  selectedFiles.forEach((file, index) => {
    const chip = document.createElement('div');
    chip.className = 'preview-chip';
    
    const img = document.createElement('img');
    img.src = URL.createObjectURL(file);
    img.alt = file.name;
    
    const removeBtn = document.createElement('button');
    removeBtn.className = 'preview-chip-remove';
    removeBtn.innerHTML = '✕';
    removeBtn.title = 'Remove';
    removeBtn.onclick = (e) => {
      e.stopPropagation();
      selectedFiles.splice(index, 1);
      renderStaging();
    };
    
    const nameTag = document.createElement('div');
    nameTag.className = 'preview-chip-name';
    nameTag.textContent = file.name;
    
    chip.appendChild(img);
    chip.appendChild(removeBtn);
    chip.appendChild(nameTag);
    stagingGrid.appendChild(chip);
  });
}

clearStagingBtn.addEventListener('click', () => {
  selectedFiles = [];
  renderStaging();
});

// Upload Handlers
uploadBtn.addEventListener('click', async () => {
  if (selectedFiles.length === 0) return;

  const formData = new FormData();
  selectedFiles.forEach(file => {
    formData.append('avatar', file);
  });

  uploadBtn.disabled = true;
  uploadBtn.innerHTML = 'Uploading...';
  progressBar.classList.add('active');
  progressFill.style.width = '60%';

  try {
    const res = await fetch('/upload', {
      method: 'POST',
      body: formData,
      headers: {
        'Accept': 'application/json'
      }
    });

    progressFill.style.width = '100%';
    const data = await res.json();

    if (!res.ok) {
      throw new Error(data.error || 'Upload failed');
    }

    showToast(`Successfully uploaded ${selectedFiles.length} image(s)!`, 'success');
    selectedFiles = [];
    renderStaging();
    await fetchImages();
  } catch (err) {
    showToast(err.message, 'error');
  } finally {
    uploadBtn.disabled = false;
    uploadBtn.innerHTML = `
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
        <polyline points="17 8 12 3 7 8"/>
        <line x1="12" y1="3" x2="12" y2="15"/>
      </svg>
      Upload to Cloud
    `;
    setTimeout(() => {
      progressBar.classList.remove('active');
      progressFill.style.width = '0%';
    }, 400);
  }
});

// Fetch & Render Gallery
async function fetchImages() {
  try {
    const res = await fetch('/images');
    if (!res.ok) throw new Error('Failed to fetch images');
    const data = await res.json();
    galleryImages = data.images || [];
    renderGallery();
  } catch (err) {
    console.error(err);
    showToast('Failed to load gallery images', 'error');
  }
}

function renderGallery() {
  galleryCount.textContent = `${galleryImages.length} image${galleryImages.length === 1 ? '' : 's'}`;
  imageGrid.innerHTML = '';
  
  if (galleryImages.length === 0) {
    emptyState.style.display = 'block';
    selectAllBtn.style.display = 'none';
    deleteBatchBtn.style.display = 'none';
    return;
  }

  emptyState.style.display = 'none';
  selectAllBtn.style.display = 'inline-flex';
  updateBatchDeleteButton();

  galleryImages.forEach(img => {
    const isSelected = selectedImageIds.has(img._id);
    const card = document.createElement('div');
    card.className = `image-card ${isSelected ? 'selected' : ''}`;
    card.dataset.id = img._id;

    // Checkbox input & custom styling
    const checkboxId = `chk-${img._id}`;
    card.innerHTML = `
      <div class="image-thumbnail-wrapper">
        <input type="checkbox" id="${checkboxId}" class="card-checkbox" ${isSelected ? 'checked' : ''} />
        <label for="${checkboxId}" class="card-select-label" title="Select image">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3">
            <polyline points="20 6 9 17 4 12"/>
          </svg>
        </label>
        
        <div class="card-actions">
          <button class="card-action-btn copy-btn" title="Copy Image URL">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
              <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
            </svg>
          </button>
          <button class="card-action-btn view-btn" title="Expand Preview">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <polyline points="15 3 21 3 21 9"></polyline>
              <polyline points="9 21 3 21 3 15"></polyline>
              <line x1="21" y1="3" x2="14" y2="10"></line>
              <line x1="3" y1="21" x2="10" y2="14"></line>
            </svg>
          </button>
          <button class="card-action-btn delete-btn" title="Delete">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <polyline points="3 6 5 6 21 6"/>
              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
            </svg>
          </button>
        </div>

        <img class="image-thumbnail" src="${img.url || `/media/${img._id}`}" onerror="if(this.src !== window.location.origin + '/media/${img._id}') { this.src = '/media/${img._id}'; }" alt="${img.originalName || 'Uploaded Media'}" loading="lazy" />
      </div>

      <div class="card-details">
        <div class="card-title" title="${img.originalName || img.key}">${img.originalName || img.key}</div>
        <div class="card-meta-row">
          <span>${formatBytes(img.size)} • ${timeAgo(img.createdAt)}</span>
          <span class="card-badge ${img.storageType === 's3' ? 's3' : 'local'}">${img.storageType === 's3' ? 'AWS S3' : 'Local'}</span>
        </div>
      </div>
    `;

    // Event: Checkbox change
    const checkbox = card.querySelector('.card-checkbox');
    checkbox.addEventListener('change', (e) => {
      e.stopPropagation();
      if (checkbox.checked) {
        selectedImageIds.add(img._id);
        card.classList.add('selected');
      } else {
        selectedImageIds.delete(img._id);
        card.classList.remove('selected');
      }
      updateBatchDeleteButton();
    });

    // Event: Copy URL
    const copyBtn = card.querySelector('.copy-btn');
    copyBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      const directUrl = img.url.startsWith('http') ? img.url : `${window.location.origin}${img.url}`;
      navigator.clipboard.writeText(directUrl);
      showToast('Image URL copied to clipboard!', 'success');
    });

    // Event: View Lightbox
    const viewBtn = card.querySelector('.view-btn');
    const thumbWrapper = card.querySelector('.image-thumbnail-wrapper');
    const openModal = (e) => {
      e.stopPropagation();
      lightboxImg.src = img.url || img.filePath;
      lightboxName.textContent = img.originalName || img.key;
      lightboxLink.href = img.url || img.filePath;
      lightbox.classList.add('active');
    };
    viewBtn.addEventListener('click', openModal);
    thumbWrapper.addEventListener('click', (e) => {
      if (e.target.closest('.card-actions') || e.target.closest('.card-select-label')) return;
      openModal(e);
    });

    // Event: Single Delete
    const delBtn = card.querySelector('.delete-btn');
    delBtn.addEventListener('click', async (e) => {
      e.stopPropagation();
      if (!confirm('Are you sure you want to delete this image?')) return;
      await deleteImages([img._id]);
    });

    imageGrid.appendChild(card);
  });
}

function updateBatchDeleteButton() {
  if (selectedImageIds.size > 0) {
    deleteBatchBtn.style.display = 'inline-flex';
    deleteBatchBtn.innerHTML = `
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <polyline points="3 6 5 6 21 6"/>
        <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
      </svg>
      Delete (${selectedImageIds.size})
    `;
    selectAllBtn.textContent = selectedImageIds.size === galleryImages.length ? 'Deselect All' : 'Select All';
  } else {
    deleteBatchBtn.style.display = 'none';
    selectAllBtn.textContent = 'Select All';
  }
}

// Select All / Deselect All
selectAllBtn.addEventListener('click', () => {
  if (selectedImageIds.size === galleryImages.length) {
    selectedImageIds.clear();
  } else {
    galleryImages.forEach(img => selectedImageIds.add(img._id));
  }
  renderGallery();
});

// Batch Delete
deleteBatchBtn.addEventListener('click', async () => {
  const ids = Array.from(selectedImageIds);
  if (ids.length === 0) return;
  if (!confirm(`Are you sure you want to delete ${ids.length} selected image(s)?`)) return;
  await deleteImages(ids);
});

async function deleteImages(ids) {
  try {
    const res = await fetch('/images', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to delete images');
    
    showToast(data.message || 'Image(s) deleted successfully', 'success');
    ids.forEach(id => selectedImageIds.delete(id));
    await fetchImages();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

// Lightbox Close
document.getElementById('lightboxClose').addEventListener('click', () => {
  lightbox.classList.remove('active');
});

lightbox.addEventListener('click', (e) => {
  if (e.target === lightbox) {
    lightbox.classList.remove('active');
  }
});

window.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && lightbox.classList.contains('active')) {
    lightbox.classList.remove('active');
  }
});

// Initialization
window.addEventListener('DOMContentLoaded', () => {
  loadConfig();
  fetchImages();
});
