'use strict';
(function(root){
 const POEMS=`萬里赴戎機，關山度若飛。
朔氣傳金柝，寒光照鐵衣。
將軍百戰死，壯士十年歸。
歸來見天子，天子坐明堂。
策勳十二轉，賞賜百千強。
可汗問所欲，木蘭不用尚書郎，
願借明駝千里足，送兒還故鄉。
爺孃聞女來，出郭相扶將。
阿姊聞妹來，當戶理紅妝。
小弟聞姊來，磨刀霍霍向豬羊。
開我東閣門，坐我西閣床。
脫我戰時袍，著我舊時裳。
當窗理雲鬢，對鏡貼花黃。
出門看火伴，火伴皆驚惶； 
同行十二年，不知木蘭是女郎。
雄兔腳撲朔，雌兔眼迷離。
兩兔傍地走，安能辨我是雄雌。`.split('。').map(s=>s.trim()).filter(Boolean);
 const glyphs=s=>Array.from(s).filter(c=>!/[，。！？、；：\s]/u.test(c));
 const DISTRACTORS=Array.from('雲星雷電海山石林雪風光影城門旗鐘劍盾船橋夢醒書畫琴棋天地玄黃宇宙洪荒金銀銅鐵赤青紫翠日夜雨霧鳥獸花草魚龍');

 const api={POEMS,glyphs,DISTRACTORS};if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.DragonWords=api;
})(typeof window!=='undefined'?window:globalThis);
