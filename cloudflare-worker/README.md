# DeS gift-code proxy

Cloudflare Workers用の固定中継です。送信先はCentury Games公式交換APIだけに固定し、DeS PortalのGitHub Pagesと指定したローカル確認Originだけを許可します。任意URLを転送する機能はありません。

Cloudflare上のWorker名：`des-giftcode-proxy`
