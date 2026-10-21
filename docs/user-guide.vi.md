# Tài liệu 3fingers

Lướt nhiều mạng xã hội cạnh nhau trong một tab Chrome, với tối đa ba khung.

## Các mạng xã hội được hỗ trợ

Facebook, Instagram, Threads, X và Reddit có thể cuộn đồng bộ. TikTok và YouTube Shorts luôn cuộn riêng. Reels trên Facebook và Instagram cũng cuộn riêng khi đang mở; quay về bảng tin sẽ khôi phục lựa chọn ghim trước đó.

YouTube chỉ hỗ trợ Shorts. Một số phần cài đặt và tính năng phụ của X có thể không hoạt động.

## Cài đặt

1. Tải tệp ZIP của 3fingers trong mục **Assets** ở [bản phát hành mới nhất trên GitHub](https://github.com/tqdat410/3fingers/releases/latest). Không chọn tệp ZIP mã nguồn (Source code).
2. Giải nén vào một thư mục cố định.
3. Mở `chrome://extensions`, bật **Chế độ dành cho nhà phát triển (Developer mode)**, bấm **Tải tiện ích đã giải nén (Load unpacked)** rồi chọn thư mục đó.
4. Bấm biểu tượng 3fingers trên thanh công cụ Chrome để mở.

Dùng Chrome trên máy tính. Không cần build hay chạy máy chủ. Nếu một trang yêu cầu đăng nhập, hãy mở trang đó ở tab thông thường trong cùng hồ sơ Chrome, đăng nhập rồi quay lại 3fingers.

## Kết nối mạng xã hội

Bấm **+** trong menu tiện ích để thêm mạng xã hội, hoặc dùng nút đổi trang trên mỗi khung để chọn trang khác. Chrome sẽ hỏi quyền truy cập khi cần và thường ghi nhớ lựa chọn của bạn. Nếu đã từ chối, bấm **Mở (Open)** trên khung để thử lại.

Thông báo “Read and change your data” của Chrome cho phép 3fingers hiển thị và điều khiển trang đó. Reddit và X cần thêm quyền truy cập cookie; TikTok cần truy cập các tên miền phụ để phát video. Xem [chính sách quyền riêng tư](privacy-policy.vi.md) để biết cụ thể dữ liệu được sử dụng.

## Đọc đồng bộ hoặc riêng từng trang

- Lăn chuột để cuộn các bảng tin cùng lúc.
- **Ghim rỗng:** cuộn đồng bộ. **Ghim đặc:** cuộn riêng. Bấm ghim để chuyển.
- Kéo nội dung lên hoặc xuống để cuộn riêng một bảng tin, kể cả khi đang bật đồng bộ.

Bình luận và hộp thoại vẫn cuộn riêng. Đóng chúng để quay lại bảng tin. Các trang xem video ngắn cuộn riêng như mô tả ở trên.

## Sắp xếp khung

Kéo vùng trống trên thanh công cụ của khung để đổi vị trí. Thả chuột để lưu, hoặc nhấn Escape để hủy. Khi dùng bàn phím, chọn nút ghim rồi nhấn phím mũi tên để đổi thứ tự.

Bấm **+** để thêm khung, nút đổi trang để thay mạng xã hội, hoặc **×** để đóng. Có thể mở cùng một mạng xã hội nhiều lần, tối đa ba khung.

Một khung chiếm toàn bộ chiều rộng; ba khung chia đều. Khi có hai khung, nút chỉnh độ rộng cho chọn **33%, 50% hoặc 66%**. Khung còn lại tự điều chỉnh tương ứng.

## Điều hướng và giao diện

Nút **Quay lại (Back)** và **Tải lại (Reload)** chỉ tác động đến khung đó. Quay lại có thể tải lại trang và không khôi phục bản nháp chưa gửi. **Tải lại tất cả (Reload all)** trong menu tiện ích tải lại các trang đang mở cùng lúc.

Nút mặt trời/mặt trăng trên mỗi khung đổi giao diện sáng/tối có sẵn của mạng xã hội. Một số trang cần tải lại để áp dụng; lựa chọn này có thể ảnh hưởng cả tab khác hoặc cài đặt tài khoản. Nút sẽ bị vô hiệu hóa nếu không đổi được giao diện của trang. Nút sáng/tối trong menu tiện ích chỉ đổi giao diện 3fingers.

## Ngôn ngữ

Từ phiên bản **1.1**, nút **EN / VI** hiển thị ngôn ngữ đang dùng; bấm để đổi. Lần đầu, 3fingers chọn theo ngôn ngữ Chrome và ghi nhớ nếu bạn chọn lại. Tùy chọn này chỉ đổi ngôn ngữ của tiện ích, không đổi ngôn ngữ mạng xã hội. Nút **?** mở hướng dẫn bằng ngôn ngữ đã chọn.

## Cập nhật

Tải tệp ZIP mới, thay các tệp **trong thư mục cài đặt cũ**, rồi bấm **Tải lại (Reload)** trên thẻ 3fingers tại `chrome://extensions`.

Giữ nguyên hồ sơ Chrome và không gỡ tiện ích nếu muốn giữ bố cục. Bản cài từ GitHub cần cập nhật thủ công.

## Tương thích và hỗ trợ

Nếu một trang không tải được, thử **Tải lại**, rồi kiểm tra trang đó ở tab thông thường. Trạng thái **Đã kết nối (Connected)** chỉ cho biết tiện ích kết nối được với khung, không có nghĩa mọi bài đăng hoặc video đã tải xong. Thay đổi từ phía mạng xã hội có thể khiến một số tính năng ngừng hoạt động.

Việc nhúng các trang làm giảm một số lớp bảo vệ của chúng bên trong 3fingers. Xem chi tiết trong [chính sách quyền riêng tư](privacy-policy.vi.md).

[Báo lỗi](https://github.com/tqdat410/3fingers/issues/new/choose) kèm phiên bản Chrome và các bước gặp lỗi. Xóa nội dung riêng tư, cookie và token khỏi ảnh chụp hoặc nhật ký lỗi trước khi gửi.

## Mã nguồn và giấy phép

3fingers là dự án độc lập, sử dụng giấy phép [GPL-3.0-only](https://github.com/tqdat410/3fingers/blob/main/LICENSE). Giấy phép này cho phép sử dụng thương mại theo các điều khoản đi kèm. [Mã nguồn và các bản phát hành](https://github.com/tqdat410/3fingers) có trên GitHub. Dự án không liên kết với các nền tảng mạng xã hội.
