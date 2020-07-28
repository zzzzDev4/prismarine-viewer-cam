/* global XMLHttpRequest postMessage self performance */

const { Vec3 } = require('vec3')
const { World } = require('./world')
const { getSectionGeometry } = require('./models')

function getJSON (url, callback) {
  var xhr = new XMLHttpRequest()
  xhr.open('GET', url, true)
  xhr.responseType = 'json'
  xhr.onload = function () {
    var status = xhr.status
    if (status === 200) {
      callback(null, xhr.response)
    } else {
      callback(status, xhr.response)
    }
  }
  xhr.send()
}

let blocksStates = null
getJSON('blocksStates.json', (err, json) => {
  if (err) return
  blocksStates = json
})

let world = null

function sectionKey (x, y, z) {
  return `${x},${y},${z}`
}

const dirtySections = {}

function setSectionDirty (pos, value = true) {
  const x = Math.floor(pos.x / 16) * 16
  const y = Math.floor(pos.y / 16) * 16
  const z = Math.floor(pos.z / 16) * 16
  const chunk = world.getColumn(x, z)
  if (chunk && chunk.sections[Math.floor(y / 16)]) {
    const key = sectionKey(x, y, z)
    dirtySections[key] = value
    if (!dirtySections[key]) delete dirtySections[key]
  }
}

self.onmessage = ({ data }) => {
  if (data.type === 'version') {
    world = new World(data.version)
  } else if (data.type === 'chunk') {
    world.addColumn(data.x, data.z, data.chunk)
    for (let y = 0; y < 256; y += 16) {
      const loc = new Vec3(data.x, y, data.z)
      setSectionDirty(loc)
      setSectionDirty(loc.offset(-16, 0, 0))
      setSectionDirty(loc.offset(16, 0, 0))
      setSectionDirty(loc.offset(0, 0, -16))
      setSectionDirty(loc.offset(0, 0, 16))
    }
  } else if (data.type === 'unloadChunk') {
    world.removeColumn(data.x, data.z)
    for (let y = 0; y < 256; y += 16) {
      setSectionDirty(new Vec3(data.x, y, data.z), false)
    }
  } else if (data.type === 'blockUpdate') {
    const loc = new Vec3(data.pos.x, data.pos.y, data.pos.z).floored()
    world.setBlockStateId(loc, data.stateId)
    setSectionDirty(loc)
    if ((loc.x & 15) === 0) setSectionDirty(loc.offset(-16, 0, 0))
    if ((loc.x & 15) === 15) setSectionDirty(loc.offset(16, 0, 0))
    if ((loc.y & 15) === 0) setSectionDirty(loc.offset(0, -16, 0))
    if ((loc.y & 15) === 15) setSectionDirty(loc.offset(0, 16, 0))
    if ((loc.z & 15) === 0) setSectionDirty(loc.offset(0, 0, -16))
    if ((loc.z & 15) === 15) setSectionDirty(loc.offset(0, 0, 16))
  }
}

setInterval(() => {
  if (world === null || blocksStates === null) return
  const sections = Object.keys(dirtySections)

  if (sections.length === 0) return
  console.log(sections.length + ' dirty sections')

  const start = performance.now()
  for (const key of sections) {
    let [x, y, z] = key.split(',')
    x = parseInt(x, 10)
    y = parseInt(y, 10)
    z = parseInt(z, 10)
    const chunk = world.getColumn(x, z)
    if (chunk && chunk.sections[Math.floor(y / 16)]) {
      delete dirtySections[key]
      const geometry = getSectionGeometry(x, y, z, world, blocksStates)
      postMessage({ type: 'geometry', key, geometry })
    }
  }
  const time = performance.now() - start
  console.log(`Processed ${sections.length} sections in ${time} ms (${time / sections.length} ms/section)`)
}, 50)
