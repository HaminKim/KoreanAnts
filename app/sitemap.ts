import { MetadataRoute } from 'next'

export default function sitemap(): MetadataRoute.Sitemap {
  // 나중에 페이지가 늘어나면 이 배열([ ]) 안에 추가하면 됩니다.
  return [
    {
      url: 'https://www.reant.kr', // 1. 사장님 사이트의 메인 주소
      lastModified: new Date(),   // 2. 마지막 수정일 (오늘 날짜로 자동 설정)
      changeFrequency: 'daily',    // 3. 업데이트 빈도 (매일 방문해달라고 요청)
      priority: 1,                // 4. 중요도 (1이 최고점, 메인 페이지니까 1점!)
    },
    // 예시: 나중에 프리미엄 페이지가 생기면 아래처럼 추가할 수 있어요.
    /*
    {
      url: 'https://www.reant.kr/premium',
      lastModified: new Date(),
      changeFrequency: 'weekly',
      priority: 0.8,
    },
    */
  ]
}