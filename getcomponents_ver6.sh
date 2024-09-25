#!/bin/bash

GITHUB_TOKEN=$1
MOODLE_VER=4.1
DEBIAN_VER=debian-12

# Kiểm tra nếu GITHUB_TOKEN chưa được thiết lập
if [[ -z "$GITHUB_TOKEN" ]]; then
    echo "Lỗi: Biến môi trường GITHUB_TOKEN chưa được thiết lập."
    exit 1
fi

# Đường dẫn đến file CSV kết quả
OUTPUT_FILE="component_vers_MDL${MOODLE_VER}_${DEBIAN_VER}_docker.csv"

# Ghi header cho file CSV
echo -n "IMAGE_VERSION,IMAGE_REF_NAME" > "$OUTPUT_FILE"

get_components_from_commit() {
    local COMMIT=$1

    # Bước 1: Lấy nội dung Dockerfile tại commit được truyền vào
    DOCKERFILE=$(curl -s -H "Authorization: token $GITHUB_TOKEN" \
        "https://api.github.com/repos/bitnami/containers/contents/bitnami/moodle/${MOODLE_VER}/${DEBIAN_VER}/Dockerfile?ref=$COMMIT" | jq -r '.content' | base64 --decode)

    # Thay thế toàn bộ ${OS_ARCH} bằng amd64
    DOCKERFILE=$(echo "$DOCKERFILE" | sed 's/${OS_ARCH}/amd64/g')

    # Bước 2: Lấy ra toàn bộ mảng COMPONENTS
    COMPONENTS=$(echo "$DOCKERFILE" | grep -A 10 "COMPONENTS=(" | grep -v "COMPONENTS=(" | grep -v ")" | tr -d ' ' | tr -d '\\')

    # Bước 3: Lấy dòng chứa "org.opencontainers.image.version"
    IMAGE_VERSION=$(echo "$DOCKERFILE" | grep -oP '(?<=org.opencontainers.image.version=)[^\s]*')

    # Bước 4: Lấy dòng chứa "org.opencontainers.image.ref.name"
    IMAGE_REF_NAME=$(echo "$DOCKERFILE" | grep -oP '(?<=org.opencontainers.image.ref.name=)[^\s]*')

    # Nếu không tìm thấy IMAGE_VERSION, IMAGE_REF_NAME hoặc COMPONENTS, bỏ qua commit này
    if [[ -z "$IMAGE_VERSION" ]] || [[ -z "$IMAGE_REF_NAME" ]] || [[ -z "$COMPONENTS" ]]; then
        echo "Commit $COMMIT: Thiếu dữ liệu. Dưới đây là thông tin đã thu thập:"
        echo "IMAGE_VERSION: $IMAGE_VERSION"
        echo "IMAGE_REF_NAME: $IMAGE_REF_NAME"
        echo "COMPONENTS: $COMPONENTS"
        return
    fi

    # Loại bỏ các dòng không mong muốn trong COMPONENTS
    CLEANED_COMPONENTS=$(echo "$COMPONENTS" | sed '/^forCOMPONENT/d; /^if\[/d')

    # Tạo header cho các cột
    IFS=$'\n' # Chia tách theo dòng
    for line in $CLEANED_COMPONENTS; do
        # Lấy tên cột từ phần tử đầu tiên phân tách bằng "-"
        COLUMN_NAME=$(echo "$line" | cut -d'-' -f1 | sed 's/"//g') # Loại bỏ dấu ngoặc kép
        # Thêm tên cột vào file CSV nếu chưa tồn tại
        if ! grep -q "$COLUMN_NAME" "$OUTPUT_FILE"; then
            echo -n ",$COLUMN_NAME" >> "$OUTPUT_FILE"
        fi
    done
    echo "" >> "$OUTPUT_FILE"

    # Thêm dòng dữ liệu cho commit
    echo -n "$IMAGE_VERSION,$IMAGE_REF_NAME" >> "$OUTPUT_FILE"

    # Thêm dữ liệu cho từng dòng từ CLEANED_COMPONENTS
    for line in $CLEANED_COMPONENTS; do
        echo -n ",$line" >> "$OUTPUT_FILE"
    done

    # Kết thúc dòng CSV
    echo "" >> "$OUTPUT_FILE"

    # Hiển thị thông tin cho người dùng biết
    echo "Commit $COMMIT: Đã thêm vào file CSV."
}

# Lấy danh sách tất cả các commit
COMMITS_RESPONSE=$(curl -s -H "Authorization: token $GITHUB_TOKEN" \
    "https://api.github.com/repos/bitnami/containers/commits?path=bitnami/moodle/${MOODLE_VER}/${DEBIAN_VER}/Dockerfile")

# Kiểm tra nếu phản hồi là một lỗi
if echo "$COMMITS_RESPONSE" | jq 'has("message")' | grep true >/dev/null; then
    echo "Lỗi khi lấy danh sách commit: $(echo "$COMMITS_RESPONSE" | jq -r '.message')"
    exit 1
fi

# Lấy danh sách các commit từ phản hồi JSON
COMMITS=$(echo "$COMMITS_RESPONSE" | jq -r '.[].sha')

# Gọi hàm với từng commit
for COMMIT in $COMMITS; do
    get_components_from_commit "$COMMIT"
done

# Thông báo hoàn thành
echo "Đã hoàn thành. File CSV đã được tạo: $OUTPUT_FILE"
