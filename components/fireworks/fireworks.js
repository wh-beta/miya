// Full-screen celebration overlay, triggered by a page (see task_calendar.js
// / todo.js's maybeCelebrateToday) the moment the last item due today flips
// to done. Self-contained: the page just calls play() on it.
Component({
  data: {
    visible: false,
  },
  methods: {
    play() {
      if (this.data.visible) return;
      this._stopped = false;
      this.setData({ visible: true });
      wx.nextTick(() => this._runAnimation());
      if (this._dismissTimer) clearTimeout(this._dismissTimer);
      this._dismissTimer = setTimeout(() => this._dismiss(), 2800);
    },
    onNoop() {},
    onTapDismiss() {
      this._dismiss();
    },
    _dismiss() {
      this._stopped = true;
      if (this._dismissTimer) clearTimeout(this._dismissTimer);
      this.setData({ visible: false });
    },
    _runAnimation() {
      const query = this.createSelectorQuery();
      query
        .select('#fwCanvas')
        .fields({ node: true, size: true })
        .exec((res) => {
          if (!res || !res[0] || !res[0].node || this._stopped) return;
          const canvas = res[0].node;
          const ctx = canvas.getContext('2d');
          const sys = wx.getWindowInfo ? wx.getWindowInfo() : wx.getSystemInfoSync();
          const dpr = sys.pixelRatio || 2;
          const width = res[0].width;
          const height = res[0].height;
          canvas.width = width * dpr;
          canvas.height = height * dpr;
          ctx.scale(dpr, dpr);
          this._animate(canvas, ctx, width, height);
        });
    },
    _animate(canvas, ctx, width, height) {
      const colors = ['#FF6B6B', '#FFD166', '#06D6A0', '#4D96FF', '#FF6FB5', '#FFFFFF'];
      let particles = [];
      const burstTimes = [0, 1, 2, 3, 4, 5].map((i) => i * 260 + Math.random() * 140);
      const fired = burstTimes.map(() => false);
      const startTime = Date.now();

      const spawnBurst = () => {
        const x = width * (0.2 + Math.random() * 0.6);
        const y = height * (0.18 + Math.random() * 0.32);
        const color = colors[Math.floor(Math.random() * colors.length)];
        const count = 34;
        for (let i = 0; i < count; i++) {
          const angle = (Math.PI * 2 * i) / count + Math.random() * 0.2;
          const speed = 2 + Math.random() * 2.4;
          particles.push({
            x,
            y,
            vx: Math.cos(angle) * speed,
            vy: Math.sin(angle) * speed,
            color,
            age: 0,
            life: 55 + Math.random() * 20,
          });
        }
      };

      const loop = () => {
        if (this._stopped) return;
        const elapsed = Date.now() - startTime;
        burstTimes.forEach((t, i) => {
          if (!fired[i] && elapsed >= t) {
            fired[i] = true;
            spawnBurst();
          }
        });
        ctx.clearRect(0, 0, width, height);
        particles.forEach((p) => {
          p.vy += 0.12;
          p.x += p.vx;
          p.y += p.vy;
          p.vx *= 0.98;
          p.age += 1;
        });
        particles = particles.filter((p) => p.age < p.life && p.y < height + 20);
        particles.forEach((p) => {
          ctx.globalAlpha = Math.max(0, 1 - p.age / p.life);
          ctx.fillStyle = p.color;
          ctx.beginPath();
          ctx.arc(p.x, p.y, 2.6, 0, Math.PI * 2);
          ctx.fill();
        });
        ctx.globalAlpha = 1;
        if (elapsed < 2600 && !this._stopped) {
          canvas.requestAnimationFrame(loop);
        }
      };
      canvas.requestAnimationFrame(loop);
    },
  },
});
