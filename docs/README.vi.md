<img src="../extension/assets/icons/icon-128.png" alt="3fingers" width="64" height="64">

# 3fingers

[English](../README.md) · Tiếng Việt

> Multitask is not real!

Đọc nhiều bảng tin mạng xã hội cạnh nhau trong một tab Chrome.
Hỗ trợ Facebook, Instagram, Threads, TikTok, X, Reddit và YouTube Shorts.
Bạn có thể cuộn đồng bộ hoặc đọc riêng từng trang. TikTok và YouTube giữ cách chuyển video riêng.

Hiện phát hành trên GitHub, chưa có trên Chrome Web Store. Các mạng xã hội có thể thay đổi và ảnh hưởng khả năng tương thích.

## Cài đặt

1. Tải **ZIP của 3fingers** từ [bản phát hành mới nhất](https://github.com/tqdat410/3fingers/releases/latest). Chọn ZIP đính kèm của ứng dụng, không chọn ZIP mã nguồn do GitHub tạo.
2. Giải nén vào một thư mục bạn sẽ giữ lại, ví dụ `3fingers`.
3. Mở `chrome://extensions`, bật **Developer mode**.
4. Bấm **Load unpacked**, chọn thư mục vừa giải nén.
5. Bấm biểu tượng 3fingers trên thanh Chrome, mở social bạn muốn dùng và cấp quyền khi Chrome hỏi.

Dùng Chrome trên máy tính. Không cần build, máy chủ hoặc tài khoản 3fingers.
Nếu cần đăng nhập, hãy đăng nhập trên tab bình thường của social đó trước. Reddit và X xin thêm quyền cookies để sử dụng token CSRF của chính trang. Sau khi cập nhật, bấm **Mở (Open)** nếu panel yêu cầu cấp quyền mới.

## Sử dụng

- Bấm biểu tượng extension để mở hoặc quay về workspace. Khi đang trong workspace, biểu tượng mở menu: tải lại tất cả, giao diện sáng/tối của tool, GitHub và **+** để thêm social, tối đa ba panel.
- Lăn chuột để cuộn đồng bộ các panel có ghim rỗng. Kéo nội dung lên/xuống để chỉ cuộn panel đó.
- Bấm ghim để đọc riêng: ghim đặc là độc lập, ghim rỗng là đồng bộ. TikTok và YouTube luôn độc lập. Facebook/Instagram Reels cũng độc lập khi đang mở; quay về feed sẽ khôi phục lựa chọn ghim trước đó.
- Kéo vùng trống trên thanh của panel để đổi vị trí, thả để lưu; Escape để hủy. Các nút trên thanh vẫn giữ chức năng riêng.
- Khi có hai panel, có thể chọn độ rộng 33%, 50% hoặc 66%; panel còn lại tự lấp phần còn lại.
- Nút mặt trời/mặt trăng cạnh tải lại đổi giao diện gốc của social. Reddit và YouTube có thể tải lại panel để áp dụng. Thay đổi này cũng có thể ảnh hưởng các tab khác của cùng social. Nút sáng/tối trong menu chỉ đổi giao diện extension.
- YouTube hỗ trợ Shorts; video thường và tìm kiếm không nằm trong phạm vi hỗ trợ. TikTok giữ điều khiển video và Auto Scroll gốc khi có.
- X hỗ trợ đọc Home và trả lời bài đăng; một số cài đặt hoặc tính năng phụ có thể không hoạt động.
- Bản mã nguồn tiếp theo sau v1.0.0 bổ sung lựa chọn **Auto (Tự động) / English / Tiếng Việt** trong menu. Auto theo ngôn ngữ giao diện Chrome. Đổi ngôn ngữ tool giữ nguyên các feed, không đổi ngôn ngữ của social hay hộp thoại Chrome.

Để cập nhật, thay file **bên trong cùng thư mục cài đặt cũ**, rồi bấm **Reload** trên thẻ extension. Giữ nguyên Chrome profile, không gỡ extension hoặc nạp mỗi phiên bản từ một thư mục mới nếu muốn giữ layout. Cách này cũng áp dụng khi nâng từ Beta. Bản cài qua GitHub cần cập nhật thủ công.

## Quyền riêng tư và góp ý

3fingers không có analytics hoặc máy chủ sản phẩm. Layout và tùy chọn được giữ cục bộ trong Chrome. Nút Back giữ lịch sử URL ngắn trong phiên để quay lại riêng từng panel.
Extension không thu thập bài đăng, tin nhắn hoặc mật khẩu. Token CSRF của Reddit/X chỉ phục vụ panel của chính site, không được lưu hoặc ghi log. Social vẫn nhận hoạt động của bạn như khi dùng website của họ. Xem [chính sách quyền riêng tư](privacy-policy.vi.md).

Để nhúng trang trong workspace, extension nới lỏng bảo vệ nhúng của các site được cấp quyền. Tab bình thường không thuộc các rule này. Chỉ cấp quyền cho site bạn muốn mở; xem [ghi chú kỹ thuật](README.md#privacy) để hiểu đánh đổi.

Nếu gặp lỗi, [gửi báo lỗi](https://github.com/tqdat410/3fingers/issues/new/choose) kèm phiên bản Chrome và cách tái hiện. Xóa nội dung riêng tư khỏi ảnh chụp.

Mã nguồn dùng [GPL v3 only](../LICENSE), cho phép sử dụng thương mại theo điều kiện license. Font Ubuntu giữ [license riêng](../extension/assets/fonts/UFL.txt).

[Hướng dẫn sử dụng](user-guide.vi.md) · [Phát triển và phát hành](README.md)
