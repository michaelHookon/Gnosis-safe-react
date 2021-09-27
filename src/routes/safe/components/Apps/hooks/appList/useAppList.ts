import { useState, useEffect, useCallback } from 'react'
import { getNetworkId } from 'src/config'
import { logError, Errors } from 'src/logic/exceptions/CodedException'
import { getAppInfoFromUrl, getEmptySafeApp } from '../../utils'
import { SafeApp } from '../../types'
import { useCustomSafeApps } from './useCustomSafeApps'
import { useRemoteSafeApps } from './useRemoteSafeApps'
import { usePinnedSafeApps } from './usePinnedSafeApps'
import { FETCH_STATUS } from 'src/utils/requests'

type UseAppListReturnType = {
  appList: SafeApp[]
  removeApp: (appUrl: string) => void
  isLoading: boolean
}

const useAppList = (): UseAppListReturnType => {
  const [appList, setAppList] = useState<SafeApp[]>([])
  const { remoteSafeApps, status: remoteAppsFetchStatus } = useRemoteSafeApps()
  const { customSafeApps, updateCustomSafeApps } = useCustomSafeApps()
  const { pinnedSafeAppIds } = usePinnedSafeApps()
  const remoteIsLoading = remoteAppsFetchStatus === FETCH_STATUS.LOADING

  // Load apps list
  // for each URL we return a mocked safe-app with a loading status
  // it was developed to speed up initial page load, otherwise the
  // app renders a loading until all the safe-apps are fetched.
  useEffect(() => {
    const fetchAppCallback = (res: SafeApp) => {
      setAppList((prevStatus) => {
        const cpPrevStatus = [...prevStatus]
        const appIndex = cpPrevStatus.findIndex((a) => a.url === res.url)
        const newStatus = res.error ? FETCH_STATUS.ERROR : FETCH_STATUS.SUCCESS
        cpPrevStatus[appIndex] = { ...res, fetchStatus: newStatus }
        return cpPrevStatus.sort((a, b) => a.name.toLowerCase().localeCompare(b.name.toLowerCase()))
      })
    }

    const loadApps = async () => {
      // backward compatibility. In a previous implementation a safe app could be disabled, that state was
      // persisted in the storage.
      const customApps = customSafeApps.filter(
        (persistedApp) => !remoteSafeApps.some((app) => app.url === persistedApp.url),
      )
      const apps: SafeApp[] = [...remoteSafeApps, ...customApps]
        // if the app does not expose supported networks, include them. (backward compatible)
        .filter((app) => (!app.networks ? true : app.networks.includes(getNetworkId())))
        .map((app) => ({
          ...getEmptySafeApp(),
          ...app,
          url: app.url.trim(),
          custom: app.custom,
        }))
      setAppList(apps)

      apps.forEach((app) => {
        if (!app.name || app.name === 'unknown') {
          // We are using legacy mode, we have to fetch info from manifest
          getAppInfoFromUrl(app.url)
            .then((appFromUrl) => {
              const formatedApp = appFromUrl
              formatedApp.custom = app.custom
              fetchAppCallback(formatedApp)
            })
            .catch((err) => {
              fetchAppCallback({ ...app, error: err.message })
              logError(Errors._900, `${app.url}, ${err.message}`)
            })
        } else {
          // We already have manifest information so we directly add the app
          fetchAppCallback(app)
        }
      })
    }

    if (remoteAppsFetchStatus === FETCH_STATUS.SUCCESS && !appList.length) {
      loadApps()
    }
  }, [remoteSafeApps, customSafeApps, remoteAppsFetchStatus, appList.length])

  const removeApp = useCallback(
    (appUrl: string): void => {
      setAppList((list) => {
        const newList = list.filter(({ url }) => url !== appUrl)
        const newPersistedList = customSafeApps.filter(({ url }) => url !== appUrl)
        updateCustomSafeApps(newPersistedList)

        return newList
      })
    },
    [updateCustomSafeApps, customSafeApps],
  )

  return {
    appList,
    removeApp,
    isLoading: remoteIsLoading,
  }
}

export { useAppList }
