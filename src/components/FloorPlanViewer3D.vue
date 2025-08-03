<template>
  <div class="viewer-3d-container">
    <!-- 3D 컨트롤 툴바 -->
    <div class="controls-toolbar">
      <div class="control-group">
        <button @click="resetCamera" class="btn btn-secondary" title="Reset Camera">
          🏠 Reset View
        </button>
        <button @click="toggleWireframe" class="btn btn-secondary" title="Toggle Wireframe">
          {{ wireframe ? '🔲' : '⬜' }} Wireframe
        </button>
        <button @click="toggleLights" class="btn btn-secondary" title="Toggle Lights">
          {{ lightsOn ? '💡' : '🔅' }} Lights
        </button>
        <button @click="toggleCulling" class="btn btn-secondary" title="Toggle Frustum Culling">
          {{ cullingEnabled ? '👁️' : '🙈' }} Culling
        </button>
        <button @click="toggleLOD" class="btn btn-secondary" title="Toggle LOD">
          {{ lodEnabled ? '🎯' : '🎲' }} LOD
        </button>
      </div>
      
      <div class="control-group">
        <button @click="make3D" class="btn btn-primary" title="Convert 2D to 3D">
          🎯 Make3D
        </button>
        <button @click="clearAll3D" class="btn btn-danger" title="Clear All 3D Objects">
          🗑️ Clear 3D
        </button>
      </div>
      
      <div class="control-group">
        <label>
          Height: {{ wallHeight }}m
          <input 
            type="range" 
            v-model="wallHeight" 
            min="2" 
            max="5" 
            step="0.1"
            @input="updateWallHeight"
          />
        </label>
      </div>
    </div>

    <!-- 3D 캔버스 -->
    <div class="canvas-3d" ref="canvas3dContainer">
      <canvas ref="canvas3d" />
      
      <!-- 로딩 표시 -->
      <div v-if="loading" class="loading-overlay">
        <div class="loading"></div>
        <p>Loading 3D models...</p>
      </div>
    </div>

    <!-- 정보 패널 -->
    <div class="info-panel">
      <div class="stats">
        <span>Objects: {{ objects.length }}</span>
        <span>Visible: {{ visibleObjects }}</span>
        <span>Polygons: {{ polygonCount }}</span>
        <span>FPS: {{ fps }}</span>
        <span v-if="lodEnabled" class="lod-status">
          LOD: {{ shouldUseLOD() ? 'ON' : 'OFF' }} ({{ visibleObjects }}/{{ lodThreshold }})
        </span>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted, watch } from 'vue'
import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { useFloorplanStore } from '../stores/floorplanStore'

// 상태 관리
const canvas3d = ref<HTMLCanvasElement>()
const canvas3dContainer = ref<HTMLDivElement>()

let scene: THREE.Scene
let camera: THREE.PerspectiveCamera
let renderer: THREE.WebGLRenderer
let controls: OrbitControls
let animationId: number
let frustum: THREE.Frustum
let projScreenMatrix: THREE.Matrix4

const loading = ref(false)
const wireframe = ref(false)
const lightsOn = ref(true)
const wallHeight = ref(2.5)
const objects = ref<THREE.Object3D[]>([])
const polygonCount = ref(0)
const fps = ref(0)
const visibleObjects = ref(0)
const cullingEnabled = ref(true)
const lodEnabled = ref(true)
const lodThreshold = ref(10) // LOD 활성화 임계값 (보이는 객체 수)

// Pinia Store 사용
const floorplanStore = useFloorplanStore()

// Frustum Culling 관련 함수들
const updateFrustum = () => {
  if (!camera) return
  
  projScreenMatrix = new THREE.Matrix4()
  projScreenMatrix.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse)
  frustum = new THREE.Frustum()
  frustum.setFromProjectionMatrix(projScreenMatrix)
}

const isObjectVisible = (object: THREE.Object3D): boolean => {
  if (!cullingEnabled.value || !frustum) return true
  
  // 객체의 바운딩 박스 계산
  const box = new THREE.Box3()
  box.setFromObject(object)
  
  // Frustum과 바운딩 박스 교차 테스트
  return frustum.intersectsBox(box)
}

const updateObjectVisibility = () => {
  if (!scene) return
  
  let visibleCount = 0
  
  scene.traverse((child) => {
    if (child instanceof THREE.Mesh || child instanceof THREE.Group) {
      const isVisible = isObjectVisible(child)
      
      // LOD 객체가 아닌 경우에만 직접 가시성 설정
      if (child.userData.type !== 'placed-object-lod') {
        child.visible = isVisible
        child.userData.wasVisible = isVisible // LOD를 위한 가시성 상태 저장
        
        // LOD 객체가 연결된 경우, LOD 객체의 가시성도 업데이트
        if (child.userData.lodObject) {
          child.userData.lodObject.userData.wasVisible = isVisible
        }
      }
      
      // LOD 객체는 카운트하지 않음 (중복 방지)
      if (isVisible && child.userData.type !== 'placed-object-lod') {
        visibleCount++
      }
    }
  })
  
  // visible 개수가 변경되었을 때만 LOD 업데이트 스케줄링
  if (visibleCount !== lastVisibleCount) {
    lastVisibleCount = visibleCount
    scheduleLODUpdate()
  }
  
  visibleObjects.value = visibleCount
}

// LOD 시스템 관련 함수들
const shouldUseLOD = (): boolean => {
  const shouldUse = lodEnabled.value && visibleObjects.value > lodThreshold.value
  // 전환이 있을 때만 로그 출력 (디버깅용)
  if (shouldUse !== lastLODState) {
  
    lastLODState = shouldUse
  }
  return shouldUse
}

// LOD 색상 매핑 함수 (파스텔 톤)
const getLODColor = (category: string): number => {
  const colorMap: { [key: string]: number } = {
    'av': 0xB8D4E3,      // 파스텔 파란색 (AV 기기)
    'robot': 0xC8E6C9,   // 파스텔 초록색 (로봇)
    'appliance': 0xFFE0B2, // 파스텔 주황색 (가전제품)
    'furniture': 0xD7CCC8, // 파스텔 베이지색 (가구)
    'etc': 0xE1BEE7,     // 파스텔 보라색 (기타)
    'default': 0xF5F5F5  // 파스텔 회색 (기본)
  }
  
  return colorMap[category] || colorMap.default
}

// LOD 상태 추적용 변수
let lastLODState = false
let lodUpdateTimeout: number | null = null
let lastVisibleCount = 0

const updateLOD = () => {
  
  if (!scene) return
  
  // placed-object가 있는지 먼저 확인
  const placedObjects = scene.children.filter(child => 
    child.userData?.type === 'placed-object'
  )


  
  // placed-object가 없으면 LOD 체크하지 않음
  if (placedObjects.length === 0) {

    return
  }
  
  const useLOD = shouldUseLOD()
  let lodSwitchCount = 0
  let totalObjects = 0
  let objectsWithLOD = 0
  

  
  // placed-object만 처리 (전체 scene traverse 대신)
  placedObjects.forEach((child) => {
    if (child.userData && child.userData.type === 'placed-object') {
      totalObjects++
      const originalObject = child
      const lodObject = child.userData.lodObject
      
      
      
      if (originalObject && lodObject) {
        objectsWithLOD++
        const wasOriginalVisible = originalObject.userData.wasVisible !== false
        
        
        
        // LOD 조건에 따라 객체 전환
        if (useLOD && wasOriginalVisible) {

          // LOD 모드로 전환
          originalObject.visible = false
          lodObject.visible = true
          lodSwitchCount++
          
        } else if (!useLOD && wasOriginalVisible) {
          // 원본 모드로 전환
          originalObject.visible = true
          lodObject.visible = false
          
          
          // LOD 모델의 머티리얼을 원본 색상으로 복원
          lodObject.traverse((child: any) => {
            if (child.isMesh && child.material && child.userData.originalMaterial) {
              const original = child.userData.originalMaterial
              if (original.color) {
                child.material.color.copy(original.color)
                child.material.needsUpdate = true
                
              }
            }
          })
          
          lodSwitchCount++
          
        } else {
          // 가시성이 false인 경우 둘 다 숨김
          originalObject.visible = false
          lodObject.visible = false
          
        }
      } else {
        
      }
    }
  })
  
  
  
  // 전환이 있을 때만 로그 출력
  if (lodSwitchCount > 0) {

  }
}

// 지연된 LOD 업데이트 함수
const scheduleLODUpdate = () => {
  // 기존 타임아웃이 있으면 취소
  if (lodUpdateTimeout !== null) {
    clearTimeout(lodUpdateTimeout)
  }
  
  // 500ms 후에 LOD 업데이트 실행
  lodUpdateTimeout = setTimeout(() => {
    updateLOD()
    lodUpdateTimeout = null
  }, 500)
}

// Three.js 초기화
const initThreeJS = () => {
  if (!canvas3d.value || !canvas3dContainer.value) return

  const container = canvas3dContainer.value
  const width = container.clientWidth
  const height = container.clientHeight
  
  if (width === 0 || height === 0) {
    return
  }

  // 씬 생성
  scene = new THREE.Scene()
  scene.background = new THREE.Color(0xf0f0f0)

  // 카메라 생성
  camera = new THREE.PerspectiveCamera(75, width / height, 0.1, 2000)
  camera.position.set(0, 25, 0)
  camera.lookAt(0, 0, 0)

  // 렌더러 생성
  renderer = new THREE.WebGLRenderer({ 
    canvas: canvas3d.value,
    antialias: true,
    alpha: true,
    preserveDrawingBuffer: false,
    powerPreference: "high-performance"
  })
  renderer.setSize(width, height)
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
  renderer.outputColorSpace = THREE.SRGBColorSpace
  renderer.toneMapping = THREE.NoToneMapping
  renderer.toneMappingExposure = 1.0
  renderer.shadowMap.enabled = false

  // 카메라 컨트롤 설정
  controls = new OrbitControls(camera, renderer.domElement)
  controls.enableDamping = true
  controls.dampingFactor = 0.25
  controls.maxPolarAngle = Math.PI / 2.5
  controls.minPolarAngle = 0
  controls.target.set(0, 0, 0)
  controls.screenSpacePanning = true
  controls.enablePan = true
  controls.enableZoom = true
  controls.enableRotate = true
  controls.mouseButtons = {
    LEFT: THREE.MOUSE.ROTATE,
    MIDDLE: THREE.MOUSE.DOLLY,
    RIGHT: THREE.MOUSE.PAN
  }
  controls.rotateSpeed = 1.0
  controls.zoomSpeed = 2.0
  controls.panSpeed = 1.5
  controls.maxDistance = 150
  controls.minDistance = 0.05
  controls.update()

  // 조명 설정
  setupLights()

  // Frustum 초기화
  updateFrustum()
  
  // 렌더링 시작
  animate()
}

// 조명 설정
const setupLights = () => {
  const ambientLight = new THREE.AmbientLight(0xffffff, 2.0)
  scene.add(ambientLight)

  const directionalLight = new THREE.DirectionalLight(0xffffff, 1.5)
  directionalLight.position.set(5, 8, 3)
  directionalLight.castShadow = false
  scene.add(directionalLight)

  const fillLight = new THREE.DirectionalLight(0xffffff, 1.0)
  fillLight.position.set(-5, 5, -3)
  fillLight.castShadow = false
  scene.add(fillLight)
}

// 2D 평면도에서 3D 벽 생성
const create3DWalls = (wallsData: any) => {
  const existingWalls: any[] = []
  scene.traverse((child) => {
    if (child.userData.type === 'exterior-wall' || child.userData.type === 'interior-wall') {
      existingWalls.push(child)
    }
  })
  
  existingWalls.forEach(wall => {
    scene.remove(wall)
    if (wall.geometry) wall.geometry.dispose()
    if (wall.material) wall.material.dispose()
  })

  if ((!wallsData.exteriorWalls || wallsData.exteriorWalls.length === 0) && 
      (!wallsData.interiorWalls || wallsData.interiorWalls.length === 0)) {
    return
  }

  const canvasWidth = wallsData.canvasSize?.width || 800
  const canvasHeight = wallsData.canvasSize?.height || 600

  if (wallsData.exteriorWalls) {
    wallsData.exteriorWalls.forEach((wall: any) => {
      createWall(wall, 'exterior-wall', 0xd3d3d3, canvasWidth, canvasHeight)
    })
  }

  if (wallsData.interiorWalls) {
    wallsData.interiorWalls.forEach((wall: any) => {
      createWall(wall, 'interior-wall', 0xd3d3d3, canvasWidth, canvasHeight)
    })
  }
}

// 개별 벽 생성 함수
const createWall = (wall: any, wallType: string, color: number, canvasWidth: number, canvasHeight: number) => {
  const start = wall.start
  const end = wall.end
  
  const length = Math.sqrt(
    Math.pow(end.x - start.x, 2) + Math.pow(start.y - end.y, 2)
  )
  const angle = Math.atan2(start.y - end.y, end.x - start.x)
  
  const wallGeometry = new THREE.BoxGeometry(length / 40, wallHeight.value, 0.1)
  const wallMaterial = new THREE.MeshLambertMaterial({ 
    color: color,
    transparent: false,
    opacity: 1.0
  })
  
  const wallMesh = new THREE.Mesh(wallGeometry, wallMaterial)
  
  const centerX = (start.x + end.x) / 2
  const centerY = (start.y + end.y) / 2
  
  const pos3D_X = (centerX - canvasWidth / 2) / 40
  const pos3D_Y = wallHeight.value / 2
  const pos3D_Z = (centerY - canvasHeight / 2) / 40
  
  wallMesh.position.set(pos3D_X, pos3D_Y, pos3D_Z)
  wallMesh.rotation.y = angle
  wallMesh.castShadow = false
  wallMesh.receiveShadow = false
  wallMesh.userData.type = wallType
  
  if (wall.id) {
    wallMesh.userData.wallId = wall.id
  }
  
  scene.add(wallMesh)
}



// 애니메이션 루프
let lastTime = 0
const animate = (currentTime = 0) => {
  animationId = requestAnimationFrame(animate)
  
  // FPS 계산
  if (currentTime - lastTime >= 1000) {
    fps.value = Math.round(1000 / (currentTime - lastTime))
    lastTime = currentTime
  }
  
  controls.update()
  
  // Frustum Culling 업데이트
  updateFrustum()
  updateObjectVisibility()
  
  // LOD 업데이트는 updateObjectVisibility에서 스케줄링됨
  
  // 폴리곤 수 계산
  updatePolygonCount()
  
  renderer.render(scene, camera)
}

// 폴리곤 수 업데이트
const updatePolygonCount = () => {
  let count = 0
  scene.traverse((object) => {
    if (object instanceof THREE.Mesh && object.visible) {
      const geometry = object.geometry
      if (geometry.index) {
        count += geometry.index.count / 3
      } else {
        count += geometry.attributes.position.count / 3
      }
    }
  })
  polygonCount.value = Math.round(count)
}

// 컨트롤 함수들
const resetCamera = () => {
  camera.position.set(0, 15, 0)
  camera.lookAt(0, 0, 0)
  controls.target.set(0, 0, 0)
  controls.update()
}

const toggleWireframe = () => {
  wireframe.value = !wireframe.value
  scene.traverse((object) => {
    if (object instanceof THREE.Mesh && object.material instanceof THREE.Material) {
      (object.material as any).wireframe = wireframe.value
    }
  })
}

const toggleLights = () => {
  lightsOn.value = !lightsOn.value
  scene.traverse((object) => {
    if (object instanceof THREE.Light) {
      object.visible = lightsOn.value
    }
  })
}

const toggleCulling = () => {
  cullingEnabled.value = !cullingEnabled.value
  
  if (!cullingEnabled.value) {
    // Culling이 비활성화되면 모든 객체를 보이게 함
    scene.traverse((child) => {
      if (child instanceof THREE.Mesh || child instanceof THREE.Group) {
        child.visible = true
      }
    })
    visibleObjects.value = objects.value.length
  }
}

const toggleLOD = () => {
  lodEnabled.value = !lodEnabled.value
  
  // LOD 상태 변경 시 즉시 업데이트 (지연 없이)
  if (lodUpdateTimeout !== null) {
    clearTimeout(lodUpdateTimeout)
    lodUpdateTimeout = null
  }
  updateLOD()
}

const updateWallHeight = () => {
  scene.traverse((object) => {
    if ((object.userData.type === 'exterior-wall' || object.userData.type === 'interior-wall') && object instanceof THREE.Mesh) {
      // 기존 지오메트리 제거하고 새로운 높이로 재생성
      object.geometry.dispose()
      
      // 현재 벽의 길이와 두께 계산
      const boundingBox = new THREE.Box3().setFromObject(object)
      const width = boundingBox.max.x - boundingBox.min.x
      const depth = 0.2 // 벽 두께 고정
      
      // 새 지오메트리 생성
      object.geometry = new THREE.BoxGeometry(width, wallHeight.value, depth)
      object.position.y = wallHeight.value / 2
    }
  })
}

// 실시간 3D 오브젝트 업데이트 (Store 변경 감지용)
const updatePlacedObjectsIn3D = async (placedObjects: any[]) => {

  
  if (!scene) {
    
    return
  }

  // 기존 배치 오브젝트 모두 제거
  const existingObjects = scene.children.filter(child => child.userData.type === 'placed-object')
  
  existingObjects.forEach((obj) => {
    scene.remove(obj)
    if (obj.traverse) {
      obj.traverse((child: any) => {
        if (child.geometry) child.geometry.dispose()
        if (child.material) {
          if (Array.isArray(child.material)) {
            child.material.forEach((mat: any) => mat.dispose())
          } else {
            child.material.dispose()
          }
        }
      })
    }
  })

  // 새로운 오브젝트들 추가
  if (placedObjects.length > 0) {
    await create3DObjects(placedObjects)
  }

  // 강제 렌더링 업데이트
  if (renderer && camera) {
    scene.updateMatrixWorld(true)
    renderer.render(scene, camera)
    
    requestAnimationFrame(() => {
      renderer.render(scene, camera)
    })
  }
}

// 3D 오브젝트 생성 (GLB 모델 로딩)
const create3DObjects = async (placedObjects: any[]) => {

  
  if (!scene || !placedObjects || placedObjects.length === 0) {
    
    return
  }

  // 기존 배치 오브젝트 제거 (원본과 LOD 모두)
  const existingObjects = scene.children.filter(child => 
    child.userData.type === 'placed-object' || child.userData.type === 'placed-object-lod'
  )
  existingObjects.forEach(obj => {
    scene.remove(obj)
    if (obj.traverse) {
      obj.traverse((child: any) => {
        if (child.geometry) child.geometry.dispose()
        if (child.material) {
          if (Array.isArray(child.material)) {
            child.material.forEach((mat: any) => mat.dispose())
          } else {
            child.material.dispose()
          }
        }
      })
    }
  })

  // GLTFLoader 사용하여 GLB 모델 로딩
  const loader = new GLTFLoader()
  
  for (const placedObj of placedObjects) {
    // 상자인 경우 특별한 3D 상자 모델 생성
    if (placedObj.category === 'etc' && placedObj.isBox) {
      create3DBox(placedObj, placedObj.color || '#D2B48C')
      continue
    }
    
    try {
    console.log('loader.load', placedObj)
      // 메인 모델 로드
      const gltf = await new Promise<any>((resolve, reject) => {
        loader.load(
          placedObj.glbUrl,
          (gltf) => resolve(gltf),
          undefined,
          (error) => reject(error)
        )
      })

      const model = gltf.scene.clone()
      
      // LOD 모델이 있는 경우 로드
      let lodModel: THREE.Object3D | null = null

      if (placedObj.lodUrl) {
        try {
          
          const lodGltf = await new Promise<any>((resolve, reject) => {
            loader.load(
              placedObj.lodUrl,
              (gltf) => {
                
                resolve(gltf)
              },
              undefined,
              (error) => {
                console.error(`❌ ${placedObj.name} LOD GLB 로딩 실패:`, error)
                console.error(`   - 시도한 URL: ${placedObj.lodUrl}`)
                reject(error)
              }
            )
          })
          
          lodModel = lodGltf.scene.clone()
          
          
          // LOD 모델의 메시 정보 확인
          let lodMeshCount = 0
          if (lodModel) {
            lodModel.traverse((child: any) => {
              if (child.isMesh) {
                lodMeshCount++
  
              }
            })

          }
        } catch (lodError) {
          console.warn(`${placedObj.name} LOD 모델 로드 실패:`, lodError)
        }
      } else {
        
      }
      
      // 모델 크기 조정 (width, depth, height 기준)
      const box = new THREE.Box3().setFromObject(model)
      const size = box.getSize(new THREE.Vector3())
      const scaleX = placedObj.width / size.x   // 가로 (X축)
      const scaleZ = placedObj.depth / size.z   // 세로 (Z축)  
      const scaleY = placedObj.height / size.y  // 높이 (Y축)
      
      model.scale.set(scaleX, scaleY, scaleZ)
      
      // 모델 위치 설정
      const isTV = placedObj.category === 'av'
      const pos3D = {
        x: placedObj.position.x,
        y: isTV ? 0 : placedObj.height / 2,
        z: placedObj.position.y
      }
      
      model.position.set(pos3D.x, pos3D.y, pos3D.z)
      
      // 모델 회전 설정 (Y축 수직 회전)
      const rotationValue = placedObj.rotation
      model.rotation.y = -rotationValue
      
      // LOD 모델이 있는 경우 동일한 스케일, 위치, 회전 적용
      if (lodModel) {
        lodModel.scale.set(scaleX, scaleY, scaleZ)
        lodModel.position.set(pos3D.x, pos3D.y, pos3D.z) // 원본과 동일한 위치
        lodModel.rotation.y = -rotationValue // 원본과 동일한 회전
        
        // LOD 모델은 초기에 숨김
        lodModel.visible = false
        
        
        
        // LOD 모델에 메타데이터 설정
        lodModel.userData = {
          type: 'placed-object-lod',
          placedObjectId: placedObj.id,
          objectName: placedObj.name,
          category: placedObj.category,
          height: placedObj.height,
          boxId: placedObj.boxId,
          lodUrl: placedObj.lodUrl,  // LOD URL 정보 추가
          glbUrl: placedObj.glbUrl   // 원본 URL 정보 추가
        }
        
        // LOD 모델의 모든 머티리얼을 단일 색상으로 변경 (성능 최적화)
        lodModel.traverse((child: any) => {
          if (child.isMesh && child.material) {
            // 기존 머티리얼의 색상 정보만 저장 (텍스처 맵은 저장하지 않음)
            if (!child.userData.originalMaterial) {
              child.userData.originalMaterial = {
                color: child.material.color?.clone()
              }
            }
            
            // 완전히 새로운 단일 색상 머티리얼로 교체
            const lodColor = getLODColor(placedObj.category)
            const newMaterial = new THREE.MeshStandardMaterial({
              color: lodColor,
              roughness: 0.5,
              metalness: 0.0
            })
            
            // 기존 머티리얼 정리
            if (child.material.dispose) {
              child.material.dispose()
            }
            
            // 새 머티리얼 적용
            child.material = newMaterial
            
            
          }
        })
      }
      
      // 메타데이터 설정 (LOD 연결을 위해 userData를 나중에 설정)
      const userData: any = {
        type: 'placed-object',
        placedObjectId: placedObj.id,
        objectName: placedObj.name,
        category: placedObj.category,
        height: placedObj.height,
        boxId: placedObj.boxId,
        glbUrl: placedObj.glbUrl,   // 원본 URL 정보 추가
        lodUrl: placedObj.lodUrl    // LOD URL 정보 추가
      }
      
      scene.add(model)
      
      // LOD 모델이 있는 경우 씬에 추가하고 연결
      if (lodModel) {
        scene.add(lodModel)
        
        // userData에 LOD 연결 정보 추가
        userData.lodObject = lodModel
        lodModel.userData.originalObject = model
        
        
        
        // 즉시 확인: 연결이 제대로 되었는지 테스트
        
        
        // 1초 후 다시 확인 (비동기 문제 확인)
        setTimeout(() => {

        }, 1000)
      } else {
        
      }
      
      // 최종적으로 model.userData 설정 (LOD 정보 포함)
      model.userData = { ...userData } // 객체 복사로 변경
      
    } catch (error) {
      console.error(`❌ GLB 모델 로딩 실패 (${placedObj.name}):`, error)
      
      // 오류 시 기본 큐브로 대체
      const fallbackGeometry = new THREE.BoxGeometry(placedObj.width, placedObj.height, placedObj.depth)
      const fallbackMaterial = new THREE.MeshStandardMaterial({ 
        color: '#ff0000' // 빨간색으로 오류 표시
      })
      const fallbackMesh = new THREE.Mesh(fallbackGeometry, fallbackMaterial)
      fallbackMesh.position.set(placedObj.position.x, placedObj.height / 2, placedObj.position.y)
      fallbackMesh.userData = {
        type: 'placed-object',
        placedObjectId: placedObj.id,
        objectName: placedObj.name + ' (오류)',
        category: placedObj.category,
        height: placedObj.height,
        boxId: placedObj.boxId
      }
      scene.add(fallbackMesh)
    }
  }
}

// 3D 상자 모델 생성
const create3DBox = (placedObj: any, color: string) => {
  const pastelBrown = '#E6D5AC'
  
  const boxGeometry = new THREE.BoxGeometry(placedObj.width, placedObj.height, placedObj.depth)
  const boxMaterial = new THREE.MeshStandardMaterial({ 
    color: pastelBrown,
    transparent: true,
    opacity: 0.9
  })
  const boxMesh = new THREE.Mesh(boxGeometry, boxMaterial)
  
  const boxGroup = new THREE.Group()
  boxGroup.add(boxMesh)
  
  boxGroup.position.set(placedObj.position.x, placedObj.height / 2, placedObj.position.y)
  boxGroup.rotation.y = placedObj.rotation || 0
  
  boxGroup.userData = {
    type: 'placed-object',
    placedObjectId: placedObj.id,
    objectName: placedObj.name,
    category: placedObj.category,
    isBox: true,
    boxId: placedObj.id,
    height: placedObj.height
  }
  
  scene.add(boxGroup)
}

// 상자 위 오브젝트 배치 처리
const handleObjectsOnBoxes = () => {
  const storeObjects = floorplanStore.placedObjects
  const boxes = storeObjects.filter(obj => obj.category === 'etc' && obj.isBox)
  const allObjects = storeObjects.filter(obj => !obj.isBox)
  
  boxes.forEach(boxData => {
    const box3D = scene.children.find(child => 
      child.userData?.type === 'placed-object' && 
      child.userData?.placedObjectId === boxData.id
    )
    
    if (!box3D) {
      return
    }
    
    const boxPosition = box3D.position
    const boxHeight = boxData.height || 1.0
    const boxWidth = boxData.width || 1.0
    const boxDepth = boxData.depth || 1.0
    
    // 상자와 겹치는 모든 오브젝트 찾기
    const overlappingObjects = allObjects.filter(objData => {
      const objX = objData.position.x
      const objZ = objData.position.y
      const objWidth = objData.width || 1.0
      const objDepth = objData.depth || 1.0
      
      const boxLeft = boxData.position.x - boxWidth / 2
      const boxRight = boxData.position.x + boxWidth / 2
      const boxTop = boxData.position.y - boxDepth / 2
      const boxBottom = boxData.position.y + boxDepth / 2
      
      const objLeft = objX - objWidth / 2
      const objRight = objX + objWidth / 2
      const objTop = objZ - objDepth / 2
      const objBottom = objZ + objDepth / 2
      
      const overlapsX = !(objRight < boxLeft || objLeft > boxRight)
      const overlapsZ = !(objBottom < boxTop || objTop > boxBottom)
      
      return overlapsX && overlapsZ
    })
    
    overlappingObjects.forEach(objData => {
      const obj3D = scene.children.find(child => 
        child.userData?.type === 'placed-object' && 
        child.userData?.placedObjectId === objData.id
      )
      
      if (!obj3D) {
        return
      }
      
      const objHeight = objData.height || 1.0
      const isTV = objData.category === 'av'
      let newY
      
      if (isTV) {
        newY = boxPosition.y + boxHeight / 2
      } else {
        newY = boxPosition.y + boxHeight / 2 + objHeight / 2
      }
      
      obj3D.position.y = newY
      
      if (box3D.rotation) {
        obj3D.rotation.y = box3D.rotation.y
      }
    })
  })
}

// Store를 사용한 Make3D - 2D 객체들을 상세한 3D로 변환
const make3D = async () => {

  
  if (loading.value) {

    return
  }
  
  loading.value = true

  
  try {
    const data = floorplanStore.floorplanData


    if (!data || !data.roomSize) {

      return
    }

    if ((!data.exteriorWalls || data.exteriorWalls.length === 0) && 
        (!data.interiorWalls || data.interiorWalls.length === 0)) {

      return
    }


    create3DWalls(data)
    

    await create3DObjects(data.placedObjects || [])
    

    handleObjectsOnBoxes()
    
    // console.log('✨ addEnhanced3DFeatures 호출')
    // addEnhanced3DFeatures()
    
  } catch (error) {
    console.error('❌ Make3D 중 오류 발생:', error)
  } finally {
    loading.value = false
  }
}

// 향상된 3D 기능 추가
const addEnhanced3DFeatures = () => {
  if (!scene) {
    return
  }

  const exteriorWalls = scene.children.filter(child => child.userData.type === 'exterior-wall')
  
  if (exteriorWalls.length === 0) {
    return
  }

  let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity
  
  exteriorWalls.forEach(wall => {
    const box = new THREE.Box3().setFromObject(wall)
    minX = Math.min(minX, box.min.x)
    maxX = Math.max(maxX, box.max.x)
    minZ = Math.min(minZ, box.min.z)
    maxZ = Math.max(maxZ, box.max.z)
  })
  
  const roomWidth = maxX - minX
  const roomDepth = maxZ - minZ
  const roomCenterX = (minX + maxX) / 2
  const roomCenterZ = (minZ + maxZ) / 2
  
  addEnhancedLighting(roomCenterX, roomCenterZ, roomWidth, roomDepth)
}

// 향상된 조명 추가
const addEnhancedLighting = (centerX: number, centerZ: number, width: number, depth: number) => {
  const roomLight = new THREE.PointLight(0xffffff, 0.8, Math.max(width, depth) * 1.5)
  roomLight.position.set(centerX, 2, centerZ)
  roomLight.castShadow = false
  roomLight.userData.type = 'room-light'
  scene.add(roomLight)
}

// Clear All 3D - 모든 3D 객체 제거
const clearAll3D = () => {
  if (!scene) return

  const objectTypesToRemove = [
    'exterior-wall', 'interior-wall', 'room-floor', 'ceiling', 
    'room-light', 'corner-light', 'wall-decoration', 'placed-object'
  ]
  
  const objectsToRemove: THREE.Object3D[] = []
  
  scene.traverse((child) => {
    if (child !== scene && child.userData.type && objectTypesToRemove.includes(child.userData.type)) {
      objectsToRemove.push(child)
    }
  })
  
  objectsToRemove.forEach(obj => {
    scene.remove(obj)
    
    if (obj instanceof THREE.Mesh) {
      if (obj.geometry) {
        obj.geometry.dispose()
      }
      if (obj.material) {
        if (Array.isArray(obj.material)) {
          obj.material.forEach(mat => mat.dispose())
        } else {
          obj.material.dispose()
        }
      }
    }
  })
  
  objects.value = objects.value.filter(obj => !objectsToRemove.includes(obj))
  
  renderer.render(scene, camera)
}

// 윈도우 리사이즈 처리
const handleResize = () => {
  if (!canvas3dContainer.value) return
  
  const container = canvas3dContainer.value
  const width = container.clientWidth
  const height = container.clientHeight
  
  camera.aspect = width / height
  camera.updateProjectionMatrix()
  renderer.setSize(width, height)
  
  // Store에 캔버스 크기 업데이트
  floorplanStore.setCanvasSize({ width, height })
}

// Store 변경 감지 - 배치된 오브젝트 실시간 동기화
let isUpdating = false
watch(
  () => floorplanStore.placedObjects,
  async (newObjects, oldObjects) => {
    if (!scene || !renderer || !camera || isUpdating) return
    
    const oldLength = oldObjects?.length || 0
    const newLength = newObjects?.length || 0
    
    if (oldLength === newLength && oldObjects && newObjects) {
      const hasPositionChange = newObjects.some((newObj, index) => {
        const oldObj = oldObjects[index]
        return oldObj && (
          Math.abs(newObj.position.x - oldObj.position.x) > 0.001 ||
          Math.abs(newObj.position.y - oldObj.position.y) > 0.001 ||
          Math.abs(newObj.rotation - oldObj.rotation) > 0.001
        )
      })
      
      if (!hasPositionChange) {
        return
      }
    }
    
    isUpdating = true
    
    try {
      await updatePlacedObjectsIn3D(newObjects || [])
    } finally {
      isUpdating = false
    }
  },
  { deep: true, immediate: false }
)

// 라이프사이클
onMounted(() => {
  initThreeJS()
  window.addEventListener('resize', handleResize)
})

onUnmounted(() => {
  if (animationId) {
    cancelAnimationFrame(animationId)
  }
  window.removeEventListener('resize', handleResize)
  
  // LOD 업데이트 타임아웃 정리
  if (lodUpdateTimeout !== null) {
    clearTimeout(lodUpdateTimeout)
    lodUpdateTimeout = null
  }
  
  // Three.js 리소스 정리
  if (renderer) {
    renderer.dispose()
  }
  controls?.dispose()
})

// 외부에서 호출할 수 있는 함수들
defineExpose({
  create3DWalls,
  make3D,
  clearAll3D
})
</script>

<style scoped>
.viewer-3d-container {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: #f8f9fa;
}

.controls-toolbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0.5rem;
  background: white;
  border-bottom: 1px solid #ddd;
  box-shadow: 0 2px 4px rgba(0,0,0,0.1);
}

.control-group {
  display: flex;
  gap: 0.5rem;
  align-items: center;
}

.control-group label {
  display: flex;
  flex-direction: column;
  font-size: 0.85rem;
  color: #666;
}

.control-group input[type="range"] {
  width: 100px;
  margin-top: 0.25rem;
}

.btn {
  padding: 0.5rem 1rem;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  font-size: 0.85rem;
  font-weight: 500;
  transition: all 0.2s;
}

.btn-primary {
  background: #3498db;
  color: white;
}

.btn-primary:hover {
  background: #2980b9;
  transform: translateY(-1px);
  box-shadow: 0 2px 4px rgba(0,0,0,0.2);
}

.btn-secondary {
  background: #95a5a6;
  color: white;
}

.btn-secondary:hover {
  background: #7f8c8d;
}

.btn-danger {
  background: #e74c3c;
  color: white;
}

.btn-danger:hover {
  background: #c0392b;
  transform: translateY(-1px);
  box-shadow: 0 2px 4px rgba(0,0,0,0.2);
}

.canvas-3d {
  flex: 1;
  position: relative;
  overflow: hidden;
}

.canvas-3d canvas {
  display: block;
  width: 100%;
  height: 100%;
}

.loading-overlay {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(255, 255, 255, 0.8);
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  gap: 1rem;
}

.info-panel {
  padding: 0.5rem;
  background: white;
  border-top: 1px solid #ddd;
}

.stats {
  display: flex;
  gap: 1rem;
  font-size: 0.85rem;
  color: #666;
}

.lod-status {
  color: #e67e22;
  font-weight: 600;
}
</style> 