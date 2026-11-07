import { runExperiment } from './experiments.js';
self.onmessage = (event) => {
  try {
    const report = runExperiment(event.data, (completed, total) =>
      self.postMessage({ type: 'progress', completed, total }),
    );
    self.postMessage({ type: 'result', report });
  } catch {
    self.postMessage({ type: 'error' });
  }
};
