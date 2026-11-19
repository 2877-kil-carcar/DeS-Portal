/* もふもふ冒険のステージ一覧。ステージは 1 つずつ別ファイル（adventure-stages/sN.js）で、作り方（kit）を受け取ってステージの中身を返す。
   2 つをつないだ長いステージは adventure-stages/a.js〜f.js（つなぎ方は adventure-join.js）。つなぐ途中の間は、まだつないでいない sN.js も、つないだあとの順にならべる。
   ?v= は公開のたびに、このファイルの中も含めて全部そろえて上げる（古いファイルと混ざらないように） */
import { kit } from './adventure-world.js?v=4.25';
import a from './adventure-stages/a.js?v=4.25';
import b from './adventure-stages/b.js?v=4.25';
import c from './adventure-stages/c.js?v=4.25';
import d from './adventure-stages/d.js?v=4.25';
import e from './adventure-stages/e.js?v=4.25';
import f from './adventure-stages/f.js?v=4.25';

// A（s1→s2）・B（s3→s6）・C（s4→s8）・D（s7→s5）・E（s9→s10）・F（s11→s12）の順
export const STAGES = [a, b, c, d, e, f].map(make => make(kit));
