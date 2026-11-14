/* もふもふ冒険のステージ一覧。ステージは 1 つずつ別ファイル（adventure-stages/sN.js）で、作り方（kit）を受け取ってステージの中身を返す。
   ?v= は公開のたびに、このファイルの中も含めて全部そろえて上げる（古いファイルと混ざらないように） */
import { kit } from './adventure-world.js?v=4.02';
import s1 from './adventure-stages/s1.js?v=4.02';
import s2 from './adventure-stages/s2.js?v=4.02';
import s3 from './adventure-stages/s3.js?v=4.02';
import s4 from './adventure-stages/s4.js?v=4.02';
import s5 from './adventure-stages/s5.js?v=4.02';

export const STAGES = [s1, s2, s3, s4, s5].map(make => make(kit));
