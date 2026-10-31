#!/bin/bash
# Vercel Ignored Build Step: exit 0 = 배포 건너뜀, exit 1 = 배포
# Deployment Storage 한도 때문에 데이터 자동 커밋은 바로 배포하지 않고
# deploy-daily.yml 이 하루 2번 몰아서 배포한다.

echo "ref=$VERCEL_GIT_COMMIT_REF msg=$VERCEL_GIT_COMMIT_MESSAGE"

# renewal 은 main 과 같은 커밋을 맞춰 두는 브랜치라 미리보기 배포가 필요 없음
if [ "$VERCEL_GIT_COMMIT_REF" = "renewal" ]; then
  echo "skip: renewal branch"
  exit 0
fi

case "$VERCEL_GIT_COMMIT_MESSAGE" in
  "chore(data)"*)
    echo "skip: data commit (deploy-daily.yml 에서 배포)"
    exit 0
    ;;
esac

exit 1
