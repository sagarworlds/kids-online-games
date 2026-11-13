import { StorageService } from '../services/StorageService.js';
import { DEVICE_KEY, deviceSchema } from '../services/schemas.js';

/** One storage handle for the engine's own use (a `Stage3D` is built deep inside a scene, far from the app's services). */
let sharedStorage = null;
const storageOrShared = (storage) => storage ?? (sharedStorage ??= new StorageService());

/**
 * What is known about this device's ability to run 3D (see `deviceSchema`). Never throws: storage that cannot be read gives the defaults.
 * @param {StorageService} [storage] The app's storage; one of the engine's own by default.
 * @returns {import('../services/schemas.js').Device}
 */
export function readDevice(storage) {
  return storageOrShared(storage).read(DEVICE_KEY, deviceSchema);
}

/**
 * Records that a 3D view ran too slowly here, so games open flat by default from now on. The child can still choose 3D.
 * "Reset all progress" in the grown-ups' settings clears it with the rest.
 * @param {StorageService} [storage]
 */
export function markDeviceSlow(storage) {
  const target = storageOrShared(storage);
  target.write(DEVICE_KEY, { ...target.read(DEVICE_KEY, deviceSchema), slow3d: true });
}
