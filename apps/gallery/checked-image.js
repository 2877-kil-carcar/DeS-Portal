/* 画像の読み込み係（ギャラリー index.html と美術館 museum.html で共用）
   ・同時に読み込むのは 5 枚まで（一斉に取りに行くと保存先 ImgBB が代わりの青い画像を返すことがある）
   ・読み込めた画像の長辺が想定と違えば「代わりの画像」とみなし、間隔をあけて取り直す */
(function () {
  const PARALLEL = 5, RETRY_MS = [1500, 4000, 9000], TIMEOUT_MS = 20000;
  let active = 0;
  const queue = [];
  const pump = () => { while (active < PARALLEL && queue.length) { active++; queue.shift()(); } };

  /* 一覧用画像の想定される長辺(px)。0 は「不明なので確認しない」。
     自前の縮小版(-t.jpg)は長辺 400。新しい投稿は URL 末尾の #s=数値 に実寸を持つ。 */
  window.thumbSide = url => {
    const m = /#s=(\d+)$/.exec(url);
    return m ? +m[1] : /-t\.jpg$/i.test(url) ? 400 : 0;
  };

  /* image に url を読み込む。正しく読めたら onOk、取り直しても駄目なら onGiveUp を呼ぶ。 */
  window.loadCheckedImage = function load(image, url, side, onOk, onGiveUp, attempt = 0) {
    queue.push(() => {
      let finished = false;
      const finish = ok => {
        if (finished) return;
        finished = true;
        clearTimeout(timer);
        image.removeEventListener('load', onLoad); image.removeEventListener('error', onError);
        active--; pump();
        if (ok) onOk();
        else if (attempt < RETRY_MS.length) setTimeout(() => load(image, url, side, onOk, onGiveUp, attempt + 1), RETRY_MS[attempt]);
        else onGiveUp();
      };
      const onLoad = () => finish(!side || Math.max(image.naturalWidth, image.naturalHeight) === side);
      const onError = () => finish(false);
      const timer = setTimeout(onError, TIMEOUT_MS);
      image.addEventListener('load', onLoad); image.addEventListener('error', onError);
      // 取り直しは URL を少し変えて、ブラウザが覚えた「代わりの画像」を使わせない
      const [base, hash = ''] = url.split('#');
      image.src = attempt ? base + (base.includes('?') ? '&' : '?') + 'retry=' + attempt + (hash && '#' + hash) : url;
    });
    pump();
  };
})();
