// 部分 Android 机型的 WebView 内核较旧（实测华为 WebView 12.1.2.326 = Chromium 92），
// 缺少下面几个 AbortSignal/ES2022 API，会让校园请求、AI 对话、第二课堂直接失败。
// 只补齐本项目实际用到的能力，且全部先做特性检测：支持这些 API 的环境完全不受影响。
// 同一份文件既被运行时（esbuild 打包）require，也被界面 WebView 以 <script> 直接加载。
(function installCompatibilityShims(scope) {
  if (typeof scope.AbortController !== "function" || typeof scope.AbortSignal !== "function") return;

  function abortError() {
    return new scope.DOMException("This operation was aborted", "AbortError");
  }
  function reasonOf(signal) {
    const reason = signal.reason;
    return reason === undefined ? abortError() : reason;
  }

  const prototype = scope.AbortSignal.prototype;

  // Chromium < 100
  if (typeof prototype.throwIfAborted !== "function") {
    prototype.throwIfAborted = function throwIfAborted() {
      if (this.aborted) throw reasonOf(this);
    };
  }

  // Chromium < 98：abort(reason) 不会记录原因，signal.reason 也不存在。
  if (!("reason" in prototype)) {
    const nativeAbort = scope.AbortController.prototype.abort;
    scope.AbortController.prototype.abort = function abort(reason) {
      if (!this.signal.aborted) {
        try { this.signal.__abortReason = arguments.length > 0 ? reason : abortError(); }
        catch (error) { /* 无法在 signal 上记录时退回默认原因 */ }
      }
      return nativeAbort.apply(this, arguments);
    };
    Object.defineProperty(prototype, "reason", {
      configurable: true,
      get() { return this.aborted ? this.__abortReason : undefined; },
    });
  }

  // Chromium < 103
  if (typeof scope.AbortSignal.timeout !== "function") {
    scope.AbortSignal.timeout = function timeout(milliseconds) {
      const controller = new scope.AbortController();
      scope.setTimeout(() => controller.abort(new scope.DOMException("The operation timed out", "TimeoutError")), milliseconds);
      return controller.signal;
    };
  }

  // Chromium < 116
  if (typeof scope.AbortSignal.any !== "function") {
    scope.AbortSignal.any = function any(signals) {
      const controller = new scope.AbortController();
      const list = Array.prototype.slice.call(signals);
      for (const signal of list) {
        if (signal.aborted) { controller.abort(reasonOf(signal)); return controller.signal; }
      }
      for (const signal of list) signal.addEventListener("abort", () => controller.abort(reasonOf(signal)), { once: true });
      return controller.signal;
    };
  }

  // Chromium < 93
  if (typeof Object.hasOwn !== "function") {
    Object.hasOwn = function hasOwn(target, key) { return Object.prototype.hasOwnProperty.call(target, key); };
  }
})(typeof globalThis !== "undefined" ? globalThis : self);
