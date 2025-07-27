<template>
  <div class="object-library">
    <div class="library-header">
      <h3>📦 Object Library</h3>
      <button @click="showUploadModal = true" class="btn btn-primary">
        ➕ Add Object
      </button>
    </div>

    <!-- 카테고리 필터 -->
    <div class="category-filter">
      <select v-model="selectedCategory" @change="filterObjects">
        <option value="all">All Categories</option>
        <option value="furniture">🪑 Furniture</option>
        <option value="decoration">🎨 Decoration</option>
        <option value="appliances">🔌 Appliances</option>
        <option value="lighting">💡 Lighting</option>
        <option value="custom">📦 Custom</option>
      </select>
    </div>

    <!-- 검색 -->
    <div class="search-box">
      <input 
        v-model="searchQuery" 
        type="text" 
        placeholder="Search objects..."
        @input="filterObjects"
      />
    </div>

    <!-- 오브젝트 목록 -->
    <div class="objects-grid">
      <div 
        v-for="object in filteredObjects" 
        :key="object.id"
        class="object-item"
        :class="{ selected: selectedObject?.id === object.id }"
        @click="selectObject(object)"
        @dragstart="startDrag(object, $event)"
        draggable="true"
      >
        <div class="object-preview">
          <img 
            v-if="object.thumbnail" 
            :src="object.thumbnail" 
            :alt="object.name"
            @error="handleImageError"
          />
          <div v-else class="placeholder-icon">📦</div>
        </div>
        <div class="object-info">
          <h4>{{ object.name }}</h4>
          <p>{{ object.category }}</p>
          <small>{{ object.size || 'Unknown size' }}</small>
        </div>
        <div class="object-actions">
          <button @click.stop="editObject(object)" class="btn-icon" title="Edit">✏️</button>
          <button @click.stop="deleteObject(object)" class="btn-icon" title="Delete">🗑️</button>
        </div>
      </div>
    </div>

    <!-- 업로드 모달 -->
    <div v-if="showUploadModal" class="modal-overlay" @click="closeModal">
      <div class="modal" @click.stop>
        <div class="modal-header">
          <h3>Add New Object</h3>
          <button @click="closeModal" class="btn-close">✕</button>
        </div>
        
        <div class="modal-body">
          <form @submit.prevent="uploadObject">
            <div class="form-group">
              <label>Object Name:</label>
              <input v-model="newObject.name" type="text" required />
            </div>
            
            <div class="form-group">
              <label>Category:</label>
              <select v-model="newObject.category" required>
                <option value="furniture">Furniture</option>
                <option value="decoration">Decoration</option>
                <option value="appliances">Appliances</option>
                <option value="lighting">Lighting</option>
                <option value="custom">Custom</option>
              </select>
            </div>
            
            <div class="form-group">
              <label>GLB File:</label>
              <input 
                @change="handleFileSelect" 
                type="file" 
                accept=".glb,.gltf" 
                required 
              />
            </div>
            
            <div class="form-group">
              <label>Thumbnail (optional):</label>
              <input 
                @change="handleThumbnailSelect" 
                type="file" 
                accept="image/*" 
              />
            </div>
            
            <div class="form-group">
              <label>Description:</label>
              <textarea v-model="newObject.description" rows="3"></textarea>
            </div>
            
            <div class="modal-actions">
              <button type="button" @click="closeModal" class="btn btn-secondary">
                Cancel
              </button>
              <button type="submit" class="btn btn-primary" :disabled="uploading">
                {{ uploading ? 'Uploading...' : 'Add Object' }}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>

    <!-- 선택된 오브젝트 정보 -->
    <div v-if="selectedObject" class="selected-object-info">
      <h4>Selected Object</h4>
      <div class="object-details">
        <p><strong>Name:</strong> {{ selectedObject.name }}</p>
        <p><strong>Category:</strong> {{ selectedObject.category }}</p>
        <p><strong>Size:</strong> {{ selectedObject.size || 'Unknown' }}</p>
        <p v-if="selectedObject.description">
          <strong>Description:</strong> {{ selectedObject.description }}
        </p>
      </div>
      
      <div class="placement-controls">
        <h5>Placement Options</h5>
        <div class="form-group">
          <label>Scale:</label>
          <input 
            v-model="placementOptions.scale" 
            type="range" 
            min="0.1" 
            max="3" 
            step="0.1"
          />
          <span>{{ placementOptions.scale }}x</span>
        </div>
        
        <div class="form-group">
          <label>Rotation:</label>
          <input 
            v-model="placementOptions.rotation" 
            type="range" 
            min="0" 
            max="360" 
            step="15"
          />
          <span>{{ placementOptions.rotation }}°</span>
        </div>
        
        <button @click="placeObject" class="btn btn-primary">
          Place in 2D View
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'

// 타입 정의
interface GameObject {
  id: string
  name: string
  category: string
  glbUrl: string
  thumbnail?: string
  description?: string
  size?: string
}

interface NewObject {
  name: string
  category: string
  description: string
}

interface PlacementOptions {
  scale: number
  rotation: number
}

// 상태 관리
const objects = ref<GameObject[]>([])
const filteredObjects = ref<GameObject[]>([])
const selectedCategory = ref('all')
const searchQuery = ref('')
const selectedObject = ref<GameObject | null>(null)
const showUploadModal = ref(false)
const uploading = ref(false)

const newObject = ref<NewObject>({
  name: '',
  category: 'furniture',
  description: ''
})

const placementOptions = ref<PlacementOptions>({
  scale: 1,
  rotation: 0
})

let selectedFile: File | null = null
let selectedThumbnail: File | null = null

// 기본 오브젝트들
const defaultObjects: GameObject[] = [
  {
    id: '1',
    name: 'Chair',
    category: 'furniture',
    glbUrl: '/models/chair.glb',
    thumbnail: '/thumbnails/chair.png',
    description: 'Modern office chair',
    size: '0.6m x 0.6m x 1.2m'
  },
  {
    id: '2',
    name: 'Table',
    category: 'furniture',
    glbUrl: '/models/table.glb',
    thumbnail: '/thumbnails/table.png',
    description: 'Wooden dining table',
    size: '2m x 1m x 0.8m'
  },
  {
    id: '3',
    name: 'Sofa',
    category: 'furniture',
    glbUrl: '/models/sofa.glb',
    thumbnail: '/thumbnails/sofa.png',
    description: 'Comfortable 3-seat sofa',
    size: '2.2m x 0.9m x 0.8m'
  },
  {
    id: '4',
    name: 'Plant',
    category: 'decoration',
    glbUrl: '/models/plant.glb',
    thumbnail: '/thumbnails/plant.png',
    description: 'Indoor decorative plant',
    size: '0.3m x 0.3m x 0.6m'
  },
  {
    id: '5',
    name: 'Lamp',
    category: 'lighting',
    glbUrl: '/models/lamp.glb',
    thumbnail: '/thumbnails/lamp.png',
    description: 'Table lamp with warm light',
    size: '0.3m x 0.3m x 0.5m'
  }
]

// 계산된 속성
const filteredObjects_computed = computed(() => {
  let result = objects.value

  // 카테고리 필터
  if (selectedCategory.value !== 'all') {
    result = result.filter(obj => obj.category === selectedCategory.value)
  }

  // 검색 필터
  if (searchQuery.value) {
    const query = searchQuery.value.toLowerCase()
    result = result.filter(obj => 
      obj.name.toLowerCase().includes(query) ||
      obj.description?.toLowerCase().includes(query)
    )
  }

  return result
})

// 오브젝트 필터링
const filterObjects = () => {
  filteredObjects.value = filteredObjects_computed.value
}

// 오브젝트 선택
const selectObject = (object: GameObject) => {
  selectedObject.value = object
}

// 드래그 시작
const startDrag = (object: GameObject, event: DragEvent) => {
  if (event.dataTransfer) {
    event.dataTransfer.setData('application/json', JSON.stringify({
      type: 'object',
      object: object,
      placementOptions: placementOptions.value
    }))
  }
}

// 파일 선택 핸들러
const handleFileSelect = (event: Event) => {
  const target = event.target as HTMLInputElement
  if (target.files && target.files[0]) {
    selectedFile = target.files[0]
  }
}

const handleThumbnailSelect = (event: Event) => {
  const target = event.target as HTMLInputElement
  if (target.files && target.files[0]) {
    selectedThumbnail = target.files[0]
  }
}

// 이미지 에러 핸들링
const handleImageError = (event: Event) => {
  const target = event.target as HTMLImageElement
  target.style.display = 'none'
  target.parentElement!.innerHTML = '<div class="placeholder-icon">📦</div>'
}

// 오브젝트 업로드
const uploadObject = async () => {
  if (!selectedFile) return

  uploading.value = true

  try {
    // 실제 구현에서는 서버에 파일 업로드
    const objectUrl = URL.createObjectURL(selectedFile)
    let thumbnailUrl = ''
    
    if (selectedThumbnail) {
      thumbnailUrl = URL.createObjectURL(selectedThumbnail)
    }

    const newObj: GameObject = {
      id: Date.now().toString(),
      name: newObject.value.name,
      category: newObject.value.category,
      description: newObject.value.description,
      glbUrl: objectUrl,
      thumbnail: thumbnailUrl,
      size: 'Custom size'
    }

    objects.value.push(newObj)
    filterObjects()
    closeModal()

  } catch (error) {
    console.error('업로드 실패:', error)
    alert('파일 업로드에 실패했습니다.')
  } finally {
    uploading.value = false
  }
}

// 오브젝트 편집
const editObject = (object: GameObject) => {
  // 편집 모달 표시 로직
  console.log('Edit object:', object)
}

// 오브젝트 삭제
const deleteObject = (object: GameObject) => {
  if (confirm(`"${object.name}"을(를) 삭제하시겠습니까?`)) {
    const index = objects.value.findIndex(obj => obj.id === object.id)
    if (index > -1) {
      objects.value.splice(index, 1)
      filterObjects()
      
      if (selectedObject.value?.id === object.id) {
        selectedObject.value = null
      }
    }
  }
}

// 2D 뷰에 오브젝트 배치
const placeObject = () => {
  if (!selectedObject.value) return

  // 이벤트 발생 (부모 컴포넌트에서 처리)
  window.dispatchEvent(new CustomEvent('placeObject', {
    detail: {
      object: selectedObject.value,
      options: placementOptions.value
    }
  }))
}

// 모달 관련
const closeModal = () => {
  showUploadModal.value = false
  newObject.value = {
    name: '',
    category: 'furniture',
    description: ''
  }
  selectedFile = null
  selectedThumbnail = null
}

// 라이프사이클
onMounted(() => {
  objects.value = [...defaultObjects]
  filterObjects()
})
</script>

<style scoped>
.object-library {
  display: flex;
  flex-direction: column;
  height: 100%;
  padding: 1rem;
  background: #f8f9fa;
}

.library-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 1rem;
}

.library-header h3 {
  margin: 0;
  font-size: 1.1rem;
  color: #2c3e50;
}

.category-filter, .search-box {
  margin-bottom: 1rem;
}

.category-filter select,
.search-box input {
  width: 100%;
  padding: 0.5rem;
  border: 1px solid #ddd;
  border-radius: 4px;
  font-size: 0.9rem;
}

.objects-grid {
  flex: 1;
  overflow-y: auto;
  display: grid;
  grid-template-columns: 1fr;
  gap: 0.5rem;
  margin-bottom: 1rem;
}

.object-item {
  display: flex;
  flex-direction: column;
  background: white;
  border: 1px solid #ddd;
  border-radius: 8px;
  padding: 0.5rem;
  cursor: pointer;
  transition: all 0.3s ease;
  position: relative;
}

.object-item:hover {
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(0,0,0,0.1);
  border-color: #3498db;
}

.object-item.selected {
  border-color: #3498db;
  background: #e3f2fd;
}

.object-preview {
  width: 100%;
  height: 80px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #f5f5f5;
  border-radius: 4px;
  margin-bottom: 0.5rem;
  overflow: hidden;
}

.object-preview img {
  max-width: 100%;
  max-height: 100%;
  object-fit: cover;
}

.placeholder-icon {
  font-size: 2rem;
  color: #999;
}

.object-info h4 {
  margin: 0 0 0.25rem 0;
  font-size: 0.9rem;
  color: #2c3e50;
}

.object-info p {
  margin: 0;
  font-size: 0.8rem;
  color: #666;
  text-transform: capitalize;
}

.object-info small {
  font-size: 0.7rem;
  color: #999;
}

.object-actions {
  position: absolute;
  top: 0.5rem;
  right: 0.5rem;
  display: flex;
  gap: 0.25rem;
  opacity: 0;
  transition: opacity 0.3s ease;
}

.object-item:hover .object-actions {
  opacity: 1;
}

.btn-icon {
  background: rgba(255, 255, 255, 0.9);
  border: none;
  border-radius: 4px;
  width: 24px;
  height: 24px;
  cursor: pointer;
  font-size: 0.8rem;
  display: flex;
  align-items: center;
  justify-content: center;
}

.btn-icon:hover {
  background: white;
}

/* 모달 스타일 */
.modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}

.modal {
  background: white;
  border-radius: 8px;
  width: 90%;
  max-width: 500px;
  max-height: 90vh;
  overflow-y: auto;
}

.modal-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 1rem;
  border-bottom: 1px solid #ddd;
}

.modal-header h3 {
  margin: 0;
}

.btn-close {
  background: none;
  border: none;
  font-size: 1.5rem;
  cursor: pointer;
  color: #999;
}

.modal-body {
  padding: 1rem;
}

.form-group {
  margin-bottom: 1rem;
}

.form-group label {
  display: block;
  margin-bottom: 0.5rem;
  font-weight: bold;
  color: #2c3e50;
}

.form-group input,
.form-group select,
.form-group textarea {
  width: 100%;
  padding: 0.5rem;
  border: 1px solid #ddd;
  border-radius: 4px;
  font-size: 0.9rem;
}

.modal-actions {
  display: flex;
  gap: 0.5rem;
  justify-content: flex-end;
  margin-top: 1rem;
}

/* 선택된 오브젝트 정보 */
.selected-object-info {
  background: white;
  border: 1px solid #ddd;
  border-radius: 8px;
  padding: 1rem;
  margin-top: 1rem;
}

.selected-object-info h4 {
  margin: 0 0 0.5rem 0;
  color: #2c3e50;
}

.object-details p {
  margin: 0.25rem 0;
  font-size: 0.9rem;
}

.placement-controls {
  margin-top: 1rem;
  padding-top: 1rem;
  border-top: 1px solid #eee;
}

.placement-controls h5 {
  margin: 0 0 0.5rem 0;
  color: #2c3e50;
}

.placement-controls .form-group {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  margin-bottom: 0.5rem;
}

.placement-controls .form-group label {
  margin: 0;
  font-weight: normal;
  min-width: 60px;
}

.placement-controls .form-group input[type="range"] {
  flex: 1;
}

.placement-controls .form-group span {
  min-width: 40px;
  font-size: 0.8rem;
  color: #666;
}
</style> 