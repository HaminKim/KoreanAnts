#!/bin/bash
# Vercel Ignored Build Step: exit 0 = 배포 건너뜀, exit 1 = 배포
# Deployment Storage 한도 때문에 데이터·코드 커밋 모두 바로 배포하지 않고
# deploy-daily.yml 이 하루 2번 올리는 chore(deploy) 커밋에서만 배포한다.
# 급할 때는 커밋 메시지에 [deploy] 를 넣으면 바로 배포된다.

echo "ref=$VERCEL_GIT_COMMIT_REF msg=$VERCEL_GIT_COMMIT_MESSAGE"

# renewal 은 main 과 같은 커밋을 맞춰 두는 브랜치라 미리보기 배포가 필요 없음
if [ "$VERCEL_GIT_COMMIT_REF" = "renewal" ]; then
  echo "skip: renewal branch"
  exit 0
fi

case "$VERCEL_GIT_COMMIT_MESSAGE" in
  "chore(deploy)"*|*"[deploy]"*)
    exit 1
    ;;
esac

echo "skip: deploy-daily.yml 에서 배포"
exit 0
