import React, { useState, useEffect } from 'react';
import { Select, Input, Button, Table, Spin } from 'antd';
import 'antd/dist/reset.css';

const { Option } = Select;

const App = () => {
  const [token, setToken] = useState('');
  const [moodleVer, setMoodleVer] = useState('4.1');
  const [debianVer, setDebianVer] = useState('debian-12');
  const [componentsData, setComponentsData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [filterOptions, setFilterOptions] = useState({
    IMAGE_VERSION: [],
    IMAGE_REF_NAME: []
  });
  const [filterValues, setFilterValues] = useState({
    IMAGE_VERSION: [],
    IMAGE_REF_NAME: []
  });
  const [pageSize, setPageSize] = useState(10); // Số lượng dòng hiển thị trên một trang

  useEffect(() => {
    const savedFilterValues = JSON.parse(localStorage.getItem('filterValues')) || {};
    setFilterValues((prevValues) => ({
      ...prevValues,
      ...savedFilterValues
    }));
  }, []);

  useEffect(() => {
    localStorage.setItem('filterValues', JSON.stringify(filterValues));
  }, [filterValues]);

  const fetchComponents = async () => {
    setLoading(true);
    const url = `https://api.github.com/repos/bitnami/containers/commits?path=bitnami/moodle/${moodleVer}/${debianVer}/Dockerfile`;

    try {
      const response = await fetch(url, {
        headers: {
          Authorization: `token ${token}`,
        },
      });
      const commits = await response.json();

      const allData = [];

      for (const commit of commits) {
        const commitSha = commit.sha;
        const dockerfileUrl = `https://api.github.com/repos/bitnami/containers/contents/bitnami/moodle/${moodleVer}/${debianVer}/Dockerfile?ref=${commitSha}`;
        
        const dockerfileResponse = await fetch(dockerfileUrl, {
          headers: {
            Authorization: `token ${token}`,
          },
        });
        const dockerfileData = await dockerfileResponse.json();
        const dockerfileContent = atob(dockerfileData.content); // decode base64

        const updatedDockerfile = dockerfileContent.replace(/\$\{OS_ARCH\}/g, 'amd64');

        const imageVersionMatch = updatedDockerfile.match(/org\.opencontainers\.image\.version=([^\s]*)/);
        const imageRefNameMatch = updatedDockerfile.match(/org\.opencontainers\.image\.ref\.name=([^\s]*)/);

        const imageVersion = imageVersionMatch ? imageVersionMatch[1] : "N/A";
        const imageRefName = imageRefNameMatch ? imageRefNameMatch[1] : "N/A";

        const componentsMatch = updatedDockerfile.match(/COMPONENTS=\([\s\S]*?\)/);
        if (componentsMatch) {
          let cleanedComponents = componentsMatch[0]
            .split('\n')
            .slice(1, -1)
            .map(line => line.trim().replace(/\\/, '').replace(/"/g, ''));

          const componentData = { IMAGE_VERSION: imageVersion, IMAGE_REF_NAME: imageRefName };
          cleanedComponents.forEach(line => {
            const columnName = line.split('-')[0].toLowerCase();
            componentData[columnName] = line;
          });

          allData.push({
            ...componentData,
            commit: commitSha,
          });
        }
      }

      setComponentsData(allData);
      setLoading(false);

      setFilterOptions({
        IMAGE_VERSION: [...new Set(allData.map(item => item.IMAGE_VERSION))].filter(item => item !== "N/A"),
        IMAGE_REF_NAME: [...new Set(allData.map(item => item.IMAGE_REF_NAME))].filter(item => item !== "N/A"),
      });
    } catch (error) {
      console.error("Error fetching data", error);
      setLoading(false);
    }
  };

  const filteredData = componentsData.filter(item => {
    const matchesVersion = filterValues.IMAGE_VERSION.length > 0 ? filterValues.IMAGE_VERSION.includes(item.IMAGE_VERSION) : true;
    const matchesRefName = filterValues.IMAGE_REF_NAME.length > 0 ? filterValues.IMAGE_REF_NAME.includes(item.IMAGE_REF_NAME) : true;
    return matchesVersion && matchesRefName;
  });

  const handleFilterChange = (value, columnName) => {
    setFilterValues((prevState) => ({
      ...prevState,
      [columnName]: value,
    }));
  };

  // Cấu hình cột ưu tiên
  const prioritizedColumns = [
    { title: 'Image Version', dataIndex: 'IMAGE_VERSION', key: 'IMAGE_VERSION' },
    { title: 'Image Ref Name', dataIndex: 'IMAGE_REF_NAME', key: 'IMAGE_REF_NAME' },
    { title: 'Moodle', dataIndex: 'moodle', key: 'moodle' },
    { title: 'Php', dataIndex: 'php', key: 'php' },
    { title: 'Apache', dataIndex: 'apache', key: 'apache' },
  ];

  // Tự động sinh các cột khác dựa trên dữ liệu
  const dynamicColumns = componentsData.length > 0
    ? Object.keys(componentsData[0])
        .filter(key => !['IMAGE_VERSION', 'IMAGE_REF_NAME', 'moodle', 'php', 'apache', 'commit'].includes(key))
        .map((key, idx) => ({ title: key.charAt(0).toUpperCase() + key.slice(1), dataIndex: key, key }))
    : [];

  const columns = [
    ...prioritizedColumns,  // Cột ưu tiên
    ...dynamicColumns,      // Các cột khác tự động sinh
    { title: 'Commit', dataIndex: 'commit', key: 'commit' } // Cột commit cuối cùng
  ];

  return (
    <div style={{ padding: '20px' }}>
      <h1>Fetch Docker Components</h1>
      <div style={{ marginBottom: '10px' }}>
        <Input
          placeholder="GitHub Token"
          value={token}
          onChange={(e) => setToken(e.target.value)}
          style={{ width: '300px', marginRight: '10px' }}
        />
        <Input
          placeholder="Moodle Version"
          value={moodleVer}
          onChange={(e) => setMoodleVer(e.target.value)}
          style={{ width: '150px', marginRight: '10px' }}
        />
        <Input
          placeholder="Debian Version"
          value={debianVer}
          onChange={(e) => setDebianVer(e.target.value)}
          style={{ width: '150px', marginRight: '10px' }}
        />
        <Button type="primary" onClick={fetchComponents} disabled={!token || loading}>
          {loading ? <Spin /> : "Fetch Components"}
        </Button>
      </div>

      <div style={{ marginBottom: '20px' }}>
        <h2>Filters</h2>
        {["IMAGE_VERSION", "IMAGE_REF_NAME"].map((col, idx) => (
          <div key={idx} style={{ marginBottom: '10px' }}>
            <label>{col.replace('_', ' ')}</label>
            <Select
              mode="multiple"
              style={{ width: '100%' }}
              placeholder={`Filter ${col.replace('_', ' ')}...`}
              value={filterValues[col]}
              onChange={(value) => handleFilterChange(value, col)}
            >
              {filterOptions[col] && filterOptions[col].map((option, idx) => (
                <Option key={idx} value={option}>{option}</Option>
              ))}
            </Select>
          </div>
        ))}
      </div>

      {/* Hiển thị bảng kết quả với tính năng phân trang */}
      {filteredData.length > 0 && (
        <Table
          columns={columns}
          dataSource={filteredData}
          rowKey="commit"
          pagination={{
            pageSize, // Số dòng trên một trang
            pageSizeOptions: ['10', '20', '50', '100'], // Tùy chọn số dòng
            showSizeChanger: true, // Cho phép thay đổi số dòng
            onShowSizeChange: (_, size) => setPageSize(size), // Cập nhật pageSize khi người dùng thay đổi
          }}
          scroll={{ x: 'max-content' }}
        />
      )}
    </div>
  );
};

export default App;
