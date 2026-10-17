# 3fingers — không gian đọc

Register: Product.
Scene: Người dùng Chrome desktop đọc nhiều social cùng lúc, ưu tiên nội dung website và thao tác cuộn nhanh.
Direction: Một workspace đơn giản, điều khiển tại từng panel trên thanh nhỏ; ưu tiên diện tích cho trang gốc.
Color: Restrained; primary charcoal `#1C1C1C` (`--brand-primary`), lấy từ vùng opaque của logo chính thức. Nền trắng, canvas `#F7F7F7`, muted `#686868`, line `#E5E5E5`; focus/toggle dùng charcoal. Màu lỗi giữ ý nghĩa riêng; không đổi theme social.
Type: Ubuntu 400/500/700, bản TTF gốc từ Google Fonts, bundle local theo UFL 1.0; system UI fallback cho glyph thiếu, gồm tiếng Việt. Không tải font từ server, không thay font trong social.
Logo: PNG do chủ sản phẩm cung cấp,1254×1254 RGBA trong `extension/assets/brand/logo-original.png`; giữ nguyên bản gốc. Chrome icons16/32/48/128 crop vùng nhìn thấy, padding nhẹ, giữ transparency. Header/favicon/action dùng cùng biểu tượng.
Signature: Ba vùng đọc đều nhau, thanh 32px với grip sáu chấm đen ngang ở giữa; giữ kéo scale nhẹ 0.96 theo chuột X/Y.
Dials: variance 2/10, motion 2/10 (thu nhỏ và chuyển vị trí nhẹ, tôn trọng reduced motion), density 8/10.

## Tiêu chí UX

- Workspace mới thấy Facebook, Threads, Instagram và cách cấp quyền/mở trang; không hiển thị feed giả. Tối đa ba panel cùng lúc; các panel vượt giới hạn từ layout cũ được lưu riêng để khôi phục.
- Thanh chính 48px giữ thương hiệu, toggle không chữ visible và + bên phải. + disabled/mờ tại ba panel, luôn hiện. Toggle có tooltip/accessibility Đồng bộ cuộn. Panel toolbar 32px, reload trái, tay nắm giữa, chooser và close phải. Nút 28px theo yêu cầu compact trên desktop; tooltip, focus và keyboard vẫn có. Không có Quản lý.
- Dropdown Facebook/Instagram/Threads neo tại nút, chỉ ba dòng social, không title/footer/backdrop. Native popover hỗ trợ light-dismiss/Escape; arrow keys/Home/End/Enter và clamp viewport. Duplicate hợp lệ. + mở dropdown thêm; archive restore chỉ hiện khi có legacy overflow. Empty state vẫn thêm được.
- Sắp xếp bằng tay nắm giữa panel, thu nhỏ feed bằng transform rồi đi theo chuột X/Y; preview thứ tự ngang trực tiếp. Mũi tên trái/phải hỗ trợ bàn phím, Escape hủy kéo. Giữ iframe viewport/document/offset.
- Panel luôn rộng bằng nhau; đổi thứ tự không nạp lại iframe. Không có resize, nút Chia đều hoặc thanh tên riêng phía trên feed.
- Bình luận/modal cuộn riêng; panel đang mở modal tạm giữ feed nền, quay về feed tự tiếp tục Sync Scroll.
- Trạng thái đang mở, chờ quyền, kết nối, mất kết nối và lỗi không bị nhầm với website đã chạy.
- Feed giữ navigation, bài đăng, input, card, media, bình luận và màu nền native. Extension chỉ ẩn scrollbar của vùng cuộn feed.
- Kéo dọc nội dung cuộn riêng mặc định dù Sync Scroll bật; chỉ nhận swipe sau ngưỡng di chuyển. Click không kéo vẫn native. Input, nút nhỏ, video controls, modal/nested scroller giữ thao tác website; Shift dành cho chọn chữ. Wheel/phím vẫn theo Sync Scroll; touch native cuộn riêng.
- Tên social/domain có trong tooltip/accessibility và chooser/placeholder; dữ liệu người dùng không đi vào analytics hay log sản phẩm.
- Cột hẹp vẫn truy cập được điều khiển; desktop là target chính, không thay ba panel bằng native hai tab.

Đây là UI của extension local; sitemap, SEO, AI discovery và share-to-AI không thuộc scope.

CSS trong frame ẩn scrollbar của vùng cuộn đã chọn và tạm đổi cursor/chặn chọn chữ khi swipe đang chạy. Extension không crop viewport, reparent, ẩn navigation/input, đồng nhất card/nền hoặc dựng lại feed. Chế độ Giao diện gọn trước đây vẫn bị loại khỏi phạm vi.
